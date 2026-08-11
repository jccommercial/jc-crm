import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendTelegram, esc, mention } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
// Next caches fetch() by default, and the Supabase client is built on fetch.
// Without this the tick happily re-reads a stale lead list every 15 minutes
// and chases nobody.
export const fetchCache = 'force-no-store';
export const revalidate = 0;

/**
 * The follow-up engine's heartbeat. Called every 15 minutes by cron-job.org
 * (Vercel's free cron only fires daily).
 *
 * Runs as service-role because there is no signed-in user — so the secret in
 * the query string is the only thing standing in front of it.
 *
 * Everything it sends is written to nudge_log first, and every send is
 * de-duplicated against that log, so a double-fired cron can't spam the group.
 */
export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const now = new Date();
  const sent = { cadence: 0, close: 0, pc: 0, escalation: 0, digest: 0 };

  const { data: settings } = await sb.from('settings').select('key, value');
  const S = Object.fromEntries((settings ?? []).map((r) => [r.key, Number(r.value)]));
  const escalateAfter = S.escalate_after_nudges ?? 3;

  const { data: leads, error: leadsError } = await sb
    .from('leads')
    .select('*, categories(name), app_users!leads_owner_id_fkey(display_name, telegram_user_id)')
    .in('stage', ['new', 'contacted', 'quoted', 'followup']);

  // A tick that fails quietly is worse than one that fails loudly — it looks
  // like "nothing to chase" forever. Surface it so the cron service reports it.
  if (leadsError) {
    console.error('cron: lead query failed', leadsError);
    return NextResponse.json({ ok: false, error: leadsError.message }, { status: 500 });
  }

  const open = leads ?? [];

  /** Has this exact nudge already gone out? */
  async function alreadySent(lead_id, kind, within) {
    const { data } = await sb
      .from('nudge_log')
      .select('id')
      .eq('lead_id', lead_id)
      .eq('kind', kind)
      .gte('sent_at', new Date(now.getTime() - within).toISOString())
      .limit(1);
    return (data ?? []).length > 0;
  }

  async function record(lead_id, kind, detail) {
    await sb.from('nudge_log').insert({ lead_id, kind, detail });
  }

  /* ---- 1. deadlines: a missed close is unrecoverable, so these come first ---- */

  for (const l of open) {
    if (!l.closes_at) continue;
    const hoursOut = (new Date(l.closes_at) - now) / 3600000;
    if (hoursOut < 0 || hoursOut > 24 * 7) continue;

    const band = hoursOut <= 3 ? '3h' : hoursOut <= 24 ? '24h' : hoursOut <= 72 ? '3d' : '7d';
    if (await alreadySent(l.id, 'close', 12 * 3600000)) continue;

    const urgent = band === '3h' || band === '24h';
    await sendTelegram(
      `${urgent ? '\u{1F6A8}' : '⏰'} <b>Quote closes in ${band} — ${esc(l.name)}</b>\n\n` +
        `<b>Owner</b>  ${mention(l.app_users)}\n` +
        `<b>Value</b>  ${money(l.annual_value)}\n` +
        `<b>Closes</b>  ${new Date(l.closes_at).toLocaleString('en-AU')}\n\n` +
        (urgent ? 'Lodge it or lose it.' : 'Get it in.')
    );
    await record(l.id, 'close', band);
    sent.close++;
  }

  /* ---- 2. practical completion: the one call a builder actually wants ---- */

  for (const l of open) {
    if (!l.pc_date) continue;
    const daysOut = Math.round((new Date(l.pc_date) - now) / 86400000);
    const bands = [S.pc_alert_days ?? 21, S.pc_alert_days_2 ?? 7];
    if (!bands.includes(daysOut)) continue;
    if (await alreadySent(l.id, 'pc', 20 * 3600000)) continue;

    await sendTelegram(
      `\u{1F3D7} <b>PC in ${daysOut} days — ${esc(l.name)}</b>\n\n` +
        `<b>Owner</b>  ${mention(l.app_users)}\n` +
        `<b>Value</b>  ${money(l.annual_value)}\n` +
        `<b>Stage</b>  ${l.stage}\n\n` +
        `Practical completion is close enough to be a reason to ring. Log the touch in the CRM after you have.`
    );
    await record(l.id, 'pc', String(daysOut));
    sent.pc++;
  }

  /* ---- 3. the cadence itself ---- */

  for (const l of open) {
    if (!l.next_nudge_at || new Date(l.next_nudge_at) > now) continue;
    if (await alreadySent(l.id, 'cadence', 12 * 3600000)) continue;

    const streak = (l.nudge_streak ?? 0) + 1;
    await sb.from('leads').update({ nudge_streak: streak }).eq('id', l.id);

    // Push the clock forward so a silent lead doesn't re-fire every 15 minutes.
    await sb.rpc('reset_nudge', { p_lead: l.id });

    if (streak >= escalateAfter) {
      await sendTelegram(
        `\u{1F6A9} <b>Escalation — ${esc(l.name)}</b>\n\n` +
          `${streak} nudges, no touchpoint logged.\n` +
          `<b>Owner</b>  ${mention(l.app_users)}\n` +
          `<b>Value</b>  ${money(l.annual_value)}\n\n` +
          `Flagged to Jordan.`
      );
      await record(l.id, 'escalation', `streak ${streak}`);
      sent.escalation++;
    } else {
      await sendTelegram(
        `\u{1F514} <b>Follow-up due — ${esc(l.name)}</b>\n\n` +
          `<b>Owner</b>  ${mention(l.app_users)}\n` +
          `<b>Category</b>  ${esc(l.categories?.name)}\n` +
          `<b>Value</b>  ${money(l.annual_value)}\n` +
          `<b>Stage</b>  ${l.stage}\n\n` +
          `Log the touch in the CRM once you've made contact.`
      );
      await record(l.id, 'cadence', `streak ${streak}`);
      sent.cadence++;
    }
  }

  /* ---- 4. the 08:30 digest, once a day, Adelaide time ---- */

  const adelaide = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Adelaide' }));
  if (adelaide.getHours() === 8 && adelaide.getMinutes() >= 30 && adelaide.getMinutes() < 45) {
    const { data: recent } = await sb
      .from('nudge_log')
      .select('id')
      .eq('kind', 'digest')
      .gte('sent_at', new Date(now.getTime() - 18 * 3600000).toISOString())
      .limit(1);

    if (!(recent ?? []).length) {
      await sendTelegram(await buildDigest(sb, open, now));
      await record(null, 'digest', adelaide.toDateString());
      sent.digest++;
    }
  }

  return NextResponse.json({ ok: true, checked: open.length, sent });
}

function money(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString('en-AU');
}

async function buildDigest(sb, open, now) {
  const { data: queue } = await sb
    .from('inbox_queue')
    .select('subject, from_email')
    .is('claimed_by', null)
    .eq('dismissed', false);

  const due = open.filter((l) => l.next_nudge_at && new Date(l.next_nudge_at) <= now);
  const closing = open
    .filter((l) => l.closes_at && new Date(l.closes_at) - now < 7 * 86400000)
    .sort((a, b) => a.closes_at.localeCompare(b.closes_at));

  const date = now.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Adelaide',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let out = `☀️ <b>08:30 — ${date}</b>\n`;

  if (queue?.length) {
    out += `\n<b>⚠️ Unassigned — ${queue.length} waiting</b>\n`;
    out += queue.slice(0, 6).map((q) => `• ${esc(q.subject)}`).join('\n') + '\n';
  }

  if (closing.length) {
    out += `\n<b>⏰ Closing soon</b>\n`;
    out += closing
      .slice(0, 6)
      .map((l) => `• ${esc(l.name)} — ${new Date(l.closes_at).toLocaleString('en-AU')}`)
      .join('\n') + '\n';
  }

  if (due.length) {
    const byOwner = {};
    due.forEach((l) => {
      const k = l.app_users?.display_name ?? 'Unassigned';
      (byOwner[k] ||= []).push(l);
    });
    out += `\n<b>Due today</b>\n`;
    for (const [name, rows] of Object.entries(byOwner)) {
      out += `<b>${esc(name)}</b>\n`;
      out += rows.map((l) => `• ${esc(l.name)} · ${money(l.annual_value)}`).join('\n') + '\n';
    }
  }

  const pipeline = open.reduce((t, l) => t + Number(l.annual_value || 0), 0);
  out += `\n<b>Open pipeline</b>  ${money(pipeline)} across ${open.length} leads`;

  if (!queue?.length && !closing.length && !due.length) {
    out += `\n\nNothing due, nothing unclaimed, nothing closing. Good morning.`;
  }

  return out;
}
