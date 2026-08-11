import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { money, relativeDays, shortDate, dateTime, daysBetween } from '@/lib/format';
import LeadActions from './LeadActions';

export const dynamic = 'force-dynamic';
// Supabase runs on fetch, which Next caches by default. A CRM showing a
// stale board is worse than a slow one.
export const fetchCache = 'force-no-store';

export default async function LeadPage({ params }) {
  const sb = supabaseServer();

  const { data: lead } = await sb
    .from('leads')
    .select('*, categories(*), app_users!leads_owner_id_fkey(display_name)')
    .eq('id', params.id)
    .maybeSingle();

  if (!lead) notFound();

  const [{ data: builders }, { data: touches }] = await Promise.all([
    sb.from('lead_builders').select('*').eq('lead_id', lead.id).order('created_at'),
    sb
      .from('touchpoints')
      .select('*, app_users(display_name), lead_builders(name)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false }),
  ]);

  const closed = lead.stage === 'won' || lead.stage === 'lost';
  const cadence = lead.categories?.cadence_quoted;

  // Whoever has gone quietest is who the nudge follows.
  const quietest = (builders ?? [])
    .filter((b) => !b.outcome)
    .map((b) => ({ ...b, days: daysBetween(new Date(), b.last_touch_at ?? lead.created_at) }))
    .sort((a, b) => b.days - a.days)[0];

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <header className="masthead">
        <h1 style={{ fontSize: 18 }}>{lead.name}</h1>
        <Link className="btn ghost small" href="/board">
          Back to board
        </Link>
      </header>

      <section className="panel">
        <div
          style={{
            padding: '14px 15px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 640 }}>{lead.categories?.name}</div>
            <div className="muted">
              {lead.app_users?.display_name ?? 'Unassigned'}
              {lead.site_address ? ` · ${lead.site_address}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 23, fontWeight: 500 }}>
              {money(lead.annual_value)}
            </div>
            <div className="muted">
              {lead.billing === 'oneoff'
                ? 'one-off · ex GST'
                : `${money(lead.value_amount)} × ${lead.value_freq} · annualised`}
            </div>
          </div>
        </div>

        <div className="fields">
          <Field label="Stage" value={<StageBadge stage={lead.stage} />} />
          {lead.contact_name && <Field label="Contact" value={lead.contact_name} />}
          {lead.contact_phone && (
            <Field label="Phone" value={<a href={`tel:${lead.contact_phone}`}>{lead.contact_phone}</a>} />
          )}
          {lead.contact_email && (
            <Field label="Email" value={<a href={`mailto:${lead.contact_email}`}>{lead.contact_email}</a>} />
          )}
          {lead.source && <Field label="Source" value={lead.source} />}
          {lead.closes_at && <Field label="Quote closes" value={dateTime(lead.closes_at)} />}
          {lead.pc_date && <Field label="Practical completion" value={shortDate(lead.pc_date)} />}
          <Field
            label="Next nudge"
            value={
              closed
                ? 'stopped'
                : lead.awaiting_outcome
                  ? `paused — decision ${shortDate(lead.decision_due)}`
                  : lead.next_nudge_at
                    ? relativeDays(lead.next_nudge_at)
                    : 'date-driven'
            }
          />
          {lead.braked && <Field label="Cadence" value="braked to monthly" />}
        </div>

        {lead.stage === 'lost' && (
          <div style={{ padding: '12px 15px', borderBottom: '1px solid var(--line)' }}>
            <div className="eyebrow">Lost — {lead.lost_reason?.replace('_', ' ')}</div>
            {lead.lost_note && <div style={{ fontSize: 13 }}>{lead.lost_note}</div>}
          </div>
        )}
      </section>

      {builders && builders.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Builders quoting</h2>
            <span className="muted">
              {closed
                ? 'One project, one result.'
                : quietest
                  ? `Cadence ${cadence ?? '—'} days. Quietest is ${quietest.name.split(' ')[0]} at ${quietest.days} days.`
                  : ''}
            </span>
          </div>
          <div className="panel">
            {builders.map((b) => {
              const days = daysBetween(new Date(), b.last_touch_at ?? lead.created_at);
              const stale = !closed && cadence && days >= cadence;
              return (
                <div
                  key={b.id}
                  className={`brow${b.outcome === 'awarded' ? ' awarded' : ''}${
                    closed && b.outcome !== 'awarded' ? ' dropped' : ''
                  }${stale ? ' stale' : ''}`}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</div>
                    <div className="muted">
                      {[b.contact_name, b.contact_email, b.contact_phone].filter(Boolean).join(' · ') || '—'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span className="muted num">
                      {b.touch_count} {b.touch_count === 1 ? 'touch' : 'touches'}
                    </span>
                    {b.outcome === 'awarded' && <span className="pill good">Awarded</span>}
                    {closed && b.outcome !== 'awarded' && <span className="pill flat">Not awarded</span>}
                    {!closed && (
                      <span className="num muted" style={{ color: stale ? 'var(--bad)' : undefined }}>
                        {days}d
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!closed && <LeadActions lead={lead} builders={builders ?? []} />}

      <section>
        <div className="section-head">
          <h2>Activity</h2>
          <span className="muted">{touches?.length ?? 0} touchpoints</span>
        </div>
        <div className="panel" style={{ padding: '10px 15px' }}>
          {!touches?.length && <div className="muted">Nothing logged yet.</div>}
          {touches?.map((t) => (
            <div className="tl" key={t.id}>
              <time>{shortDate(t.created_at)}</time>
              <span>
                {t.kind}
                {t.lead_builders?.name ? ` — ${t.lead_builders.name}` : ''}
                {t.note ? ` — ${t.note}` : ''}
                {t.app_users?.display_name ? ` (${t.app_users.display_name})` : ''}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <span className="eyebrow">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}

function StageBadge({ stage }) {
  const tone = stage === 'won' ? 'good' : stage === 'lost' ? 'bad' : 'flat';
  return <span className={`pill ${tone}`}>{stage}</span>;
}
