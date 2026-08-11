'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseServer, currentUser } from '@/lib/supabase';

/** Every action runs as the signed-in person, so RLS applies to all of it. */
async function ctx() {
  const me = await currentUser();
  if (!me) throw new Error('Not signed in');
  return { sb: supabaseServer(), me };
}

function str(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/* ------------------------------------------------------------------ leads */

export async function createLead(formData) {
  const { sb, me } = await ctx();

  const billing = String(formData.get('billing') || 'oneoff');
  const amount = Number(formData.get('value_amount')) || 0;
  // One-off jobs have no multiplier; the generated column ignores freq for them.
  const freq = billing === 'oneoff' ? 1 : Number(formData.get('value_freq')) || 1;

  const lead = {
    name: str(formData.get('name')),
    site_address: str(formData.get('site_address')),
    contact_name: str(formData.get('contact_name')),
    contact_phone: str(formData.get('contact_phone')),
    contact_email: str(formData.get('contact_email')),
    category_id: String(formData.get('category_id')),
    source: str(formData.get('source')),
    billing,
    value_amount: amount,
    value_freq: freq,
    closes_at: str(formData.get('closes_at')),
    pc_date: str(formData.get('pc_date')),
    stage: String(formData.get('stage') || 'new'),
    owner_id: me.id,
    created_by: me.id,
  };

  const { data, error } = await sb.from('leads').insert(lead).select('id').single();

  if (error) {
    // The unique index on open site addresses is doing its job.
    if (error.code === '23505') {
      return { error: 'That site already has an open lead. Add the builder to the existing one instead of starting a second job.' };
    }
    return { error: error.message };
  }

  // Builders arrive as parallel name/contact fields from the project form.
  const names = formData.getAll('builder_name');
  const contacts = formData.getAll('builder_contact');
  const rows = names
    .map((n, i) => ({
      lead_id: data.id,
      name: String(n || '').trim(),
      contact_email: str(contacts[i]),
    }))
    .filter((r) => r.name !== '');

  if (rows.length) await sb.from('lead_builders').insert(rows);

  revalidatePath('/board');
  redirect(`/leads/${data.id}`);
}

export async function updateLead(formData) {
  const { sb } = await ctx();
  const id = String(formData.get('lead_id'));

  const billing = String(formData.get('billing') || 'oneoff');
  const amount = Number(formData.get('value_amount'));
  const freq = billing === 'oneoff' ? 1 : Number(formData.get('value_freq')) || 1;

  const patch = {
    name: str(formData.get('name')),
    site_address: str(formData.get('site_address')),
    contact_name: str(formData.get('contact_name')),
    contact_phone: str(formData.get('contact_phone')),
    contact_email: str(formData.get('contact_email')),
    source: str(formData.get('source')),
    closes_at: str(formData.get('closes_at')),
    pc_date: str(formData.get('pc_date')),
    category_id: String(formData.get('category_id')),
    billing,
    value_freq: freq,
  };

  // Only overwrite the value if a number was actually supplied — an empty box
  // should leave the quoted figure alone, not zero it.
  if (!Number.isNaN(amount) && String(formData.get('value_amount')) !== '') {
    patch.value_amount = amount;
  }

  const { error } = await sb.from('leads').update(patch).eq('id', id);

  if (error) {
    if (error.code === '23505') {
      return { error: 'Another open lead already has that site address.' };
    }
    return { error: error.message };
  }

  revalidatePath(`/leads/${id}`);
  revalidatePath('/board');
  return { message: 'Saved.' };
}

export async function updateBuilder(formData) {
  const { sb } = await ctx();
  const id = String(formData.get('builder_id'));
  const lead_id = String(formData.get('lead_id'));

  const { error } = await sb
    .from('lead_builders')
    .update({
      name: str(formData.get('name')),
      contact_name: str(formData.get('contact_name')),
      contact_email: str(formData.get('contact_email')),
      contact_phone: str(formData.get('contact_phone')),
    })
    .eq('id', id);

  if (error) return { error: error.message };

  revalidatePath(`/leads/${lead_id}`);
  return { message: 'Builder updated.' };
}

export async function logTouch(formData) {
  const { sb, me } = await ctx();
  const lead_id = String(formData.get('lead_id'));

  const { error } = await sb.from('touchpoints').insert({
    lead_id,
    builder_id: str(formData.get('builder_id')),
    user_id: me.id,
    kind: String(formData.get('kind') || 'call'),
    note: str(formData.get('note')),
  });

  if (error) return { error: error.message };

  revalidatePath(`/leads/${lead_id}`);
  revalidatePath('/board');
  return { ok: true };
}

export async function setStage(formData) {
  const { sb } = await ctx();
  const lead_id = String(formData.get('lead_id'));
  const stage = String(formData.get('stage'));

  const patch = { stage };

  if (stage === 'lost') {
    // The database rejects a loss with no reason; catch it here so the person
    // gets a sentence rather than a constraint violation.
    const reason = str(formData.get('lost_reason'));
    if (!reason) return { error: 'Pick a reason before marking it lost.' };
    patch.lost_reason = reason;
    patch.lost_note = str(formData.get('lost_note'));
  }

  if (stage === 'won') {
    const winner = str(formData.get('won_builder_id'));
    if (winner) {
      patch.won_builder_id = winner;
      // Everyone else on the project is "not awarded" — not a loss, and it
      // never touches the loss figures.
      await sb.from('lead_builders').update({ outcome: 'not_awarded' }).eq('lead_id', lead_id);
      await sb.from('lead_builders').update({ outcome: 'awarded' }).eq('id', winner);
    }
  }

  const { error } = await sb.from('leads').update(patch).eq('id', lead_id);
  if (error) return { error: error.message };

  revalidatePath(`/leads/${lead_id}`);
  revalidatePath('/board');
  return { ok: true };
}

export async function setAwaitingOutcome(formData) {
  const { sb } = await ctx();
  const lead_id = String(formData.get('lead_id'));
  const decision_due = str(formData.get('decision_due'));

  if (!decision_due) return { error: 'A paused tender needs a decision date.' };

  const { error } = await sb
    .from('leads')
    .update({ awaiting_outcome: true, decision_due })
    .eq('id', lead_id);

  if (error) return { error: error.message };

  revalidatePath(`/leads/${lead_id}`);
  revalidatePath('/board');
  return { ok: true };
}

export async function addBuilder(formData) {
  const { sb } = await ctx();
  const lead_id = String(formData.get('lead_id'));

  const { error } = await sb.from('lead_builders').insert({
    lead_id,
    name: str(formData.get('name')),
    contact_name: str(formData.get('contact_name')),
    contact_email: str(formData.get('contact_email')),
    contact_phone: str(formData.get('contact_phone')),
  });

  if (error) return { error: error.message };

  revalidatePath(`/leads/${lead_id}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ queue */

export async function claimLead(formData) {
  const { sb, me } = await ctx();
  const id = String(formData.get('id'));

  // Only claim if nobody has: first tap wins, and the loser gets told rather
  // than silently stealing it.
  const { data, error } = await sb
    .from('inbox_queue')
    .update({ claimed_by: me.id, claimed_at: new Date().toISOString() })
    .eq('id', id)
    .is('claimed_by', null)
    .select('id')
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: 'Someone else claimed that one first.' };

  revalidatePath('/board');
  return { ok: true };
}

/* ------------------------------------------------------------------ users */

export async function addUser(formData) {
  const { sb, me } = await ctx();
  if (me.role !== 'admin') return { error: 'Admins only.' };

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const display_name = str(formData.get('display_name'));
  const role = String(formData.get('role') || 'member');

  if (!email || !display_name) return { error: 'Name and email are both needed.' };

  // Any domain is fine. This list is the gate, not the address — contractors,
  // VAs and personal addresses are all legitimate.
  const { error } = await sb.from('app_users').insert({ email, display_name, role });

  if (error) {
    if (error.code === '23505') return { error: `${email} is already on the list.` };
    return { error: error.message };
  }

  revalidatePath('/admin');
  return { message: `${display_name} added. They can sign in with ${email} now.` };
}

export async function setUserActive(formData) {
  const { sb, me } = await ctx();
  if (me.role !== 'admin') return { error: 'Admins only.' };

  const id = String(formData.get('id'));
  if (id === me.id) return { error: "You can't switch yourself off." };

  const active = String(formData.get('active')) === 'true';
  const { error } = await sb.from('app_users').update({ active }).eq('id', id);
  if (error) return { error: error.message };

  revalidatePath('/admin');
  return { message: active ? 'Access restored.' : 'Access removed. Their leads stay put.' };
}

export async function saveSpend(formData) {
  const { sb, me } = await ctx();
  if (me.role !== 'admin') return { error: 'Admins only.' };

  const month = String(formData.get('month') || '').slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'Pick a month.' };

  const row = {
    month: `${month}-01`,
    channel: String(formData.get('channel') || '').trim(),
    spend: Number(formData.get('spend')) || 0,
    clicks: Number(formData.get('clicks')) || 0,
    source: 'manual',
  };
  if (!row.channel) return { error: 'Which channel?' };

  const { error } = await sb.from('channel_spend').upsert(row, { onConflict: 'month,channel' });
  if (error) return { error: error.message };

  revalidatePath('/admin');
  revalidatePath('/dashboard');
  return { message: `${row.channel} saved for ${month}.` };
}

export async function signOut() {
  const sb = supabaseServer();
  await sb.auth.signOut();
  redirect('/login');
}
