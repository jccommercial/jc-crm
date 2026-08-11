'use client';

import { useState } from 'react';
import { updateLead, updateBuilder } from '@/app/actions';

const SOURCES = [
  'EstimateOne', 'Referral', 'Google Ads', 'Meta',
  'Website enquiry', 'Cold approach', 'Other',
];

/** ISO timestamp -> value a datetime-local input accepts. */
const dtLocal = (v) => (v ? new Date(v).toISOString().slice(0, 16) : '');

export default function EditLead({ lead, builders, categories }) {
  const [open, setOpen] = useState(false);
  const [billing, setBilling] = useState(lead.billing);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);

  async function save(formData) {
    setErr(null);
    setMsg(null);
    const res = await updateLead(formData);
    if (res?.error) setErr(res.error);
    else {
      setMsg(res?.message);
      setOpen(false);
    }
  }

  async function saveBuilder(formData) {
    setErr(null);
    setMsg(null);
    const res = await updateBuilder(formData);
    if (res?.error) setErr(res.error);
    else {
      setMsg(res?.message);
      setEditing(null);
    }
  }

  return (
    <section className="panel" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div className="eyebrow">Details</div>
        <button type="button" className="btn ghost small" onClick={() => setOpen(!open)}>
          {open ? 'Cancel' : 'Edit details'}
        </button>
      </div>

      {err && <div className="notice">{err}</div>}
      {msg && <div className="notice ok">{msg}</div>}

      {open && (
        <form action={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input type="hidden" name="lead_id" value={lead.id} />

          <div className="grid2">
            <div className="field">
              <label htmlFor="e-name">Name</label>
              <input id="e-name" name="name" defaultValue={lead.name ?? ''} required />
            </div>
            <div className="field">
              <label htmlFor="e-site">Site address</label>
              <input id="e-site" name="site_address" defaultValue={lead.site_address ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="e-cname">Contact name</label>
              <input id="e-cname" name="contact_name" defaultValue={lead.contact_name ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="e-phone">Phone</label>
              <input id="e-phone" name="contact_phone" type="tel" defaultValue={lead.contact_phone ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="e-email">Email</label>
              <input id="e-email" name="contact_email" type="email" defaultValue={lead.contact_email ?? ''} />
            </div>
            <div className="field">
              <label htmlFor="e-source">Source</label>
              <select id="e-source" name="source" defaultValue={lead.source ?? 'Other'}>
                {SOURCES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-cat">Category</label>
              <select id="e-cat" name="category_id" defaultValue={lead.category_id}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="hint">Changing this changes the chase cadence.</span>
            </div>
            <div className="field">
              <label htmlFor="e-closes">Quote closes</label>
              <input id="e-closes" name="closes_at" type="datetime-local" defaultValue={dtLocal(lead.closes_at)} />
            </div>
            <div className="field">
              <label htmlFor="e-pc">Practical completion</label>
              <input id="e-pc" name="pc_date" type="date" defaultValue={lead.pc_date ?? ''} />
              <span className="hint">Nudges at 3 weeks and 1 week out.</span>
            </div>
            <div className="field">
              <label htmlFor="e-billing">Billing</label>
              <select id="e-billing" name="billing" value={billing} onChange={(e) => setBilling(e.target.value)}>
                <option value="oneoff">One-off</option>
                <option value="recurring">Recurring</option>
                <option value="periodical">Periodical</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="e-amount">
                {billing === 'oneoff' ? 'Quoted price' : billing === 'recurring' ? 'Rate' : 'Price per visit'}
              </label>
              <input id="e-amount" name="value_amount" type="number" min="0" step="10"
                defaultValue={lead.value_amount ?? ''} />
            </div>
            {billing !== 'oneoff' && (
              <div className="field">
                <label htmlFor="e-freq">
                  {billing === 'recurring' ? 'Times per year (52 = weekly)' : 'Visits per year'}
                </label>
                <input id="e-freq" name="value_freq" type="number" min="1" max="365"
                  defaultValue={lead.value_freq ?? 52} />
              </div>
            )}
          </div>

          <div>
            <button className="btn">Save details</button>
          </div>
        </form>
      )}

      {builders.length > 0 && (
        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="eyebrow">Builder contacts</div>
          {builders.map((b) =>
            editing === b.id ? (
              <form action={saveBuilder} key={b.id} className="grid2"
                style={{ background: 'var(--panel-sunk)', padding: 10, borderRadius: 2 }}>
                <input type="hidden" name="builder_id" value={b.id} />
                <input type="hidden" name="lead_id" value={lead.id} />
                <div className="field">
                  <label>Builder</label>
                  <input name="name" defaultValue={b.name} required />
                </div>
                <div className="field">
                  <label>Contact name</label>
                  <input name="contact_name" defaultValue={b.contact_name ?? ''} />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input name="contact_email" type="email" defaultValue={b.contact_email ?? ''} />
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input name="contact_phone" type="tel" defaultValue={b.contact_phone ?? ''} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn small">Save</button>
                  <button type="button" className="btn ghost small" onClick={() => setEditing(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</span>{' '}
                  <span className="muted">
                    {[b.contact_name, b.contact_email, b.contact_phone].filter(Boolean).join(' · ') || 'no contact details'}
                  </span>
                </div>
                <button type="button" className="btn ghost small" onClick={() => setEditing(b.id)}>
                  Edit
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
