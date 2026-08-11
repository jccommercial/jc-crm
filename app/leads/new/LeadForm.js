'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createLead } from '@/app/actions';
import { money, annualise } from '@/lib/format';

const SOURCES = [
  'EstimateOne',
  'Referral',
  'Google Ads',
  'Meta',
  'Website enquiry',
  'Cold approach',
  'Other',
];

const FREQ = [
  { v: 52, label: 'per week' },
  { v: 26, label: 'per fortnight' },
  { v: 12, label: 'per month' },
];

export default function LeadForm({ categories }) {
  const [cat, setCat] = useState(categories[0]);
  const [billing, setBilling] = useState(categories[0].default_billing);
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState(52);
  const [visits, setVisits] = useState(12);
  const [error, setError] = useState(null);

  const isProject = cat.entry_shape === 'project';
  const [builders, setBuilders] = useState(['', '']);

  const multiplier = billing === 'periodical' ? visits : freq;
  const annual = annualise(billing, amount, multiplier);

  function pickCategory(c) {
    setCat(c);
    setBilling(c.default_billing);
  }

  async function submit(formData) {
    setError(null);
    const res = await createLead(formData);
    if (res?.error) setError(res.error);
  }

  return (
    <form action={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Category first — it decides the shape of everything below. */}
      <section style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <div className="eyebrow" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
          What the job is
        </div>
        <div className="chips">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              className="chip"
              aria-pressed={c.id === cat.id}
              onClick={() => pickCategory(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
        <input type="hidden" name="category_id" value={cat.id} />
        <p className="muted">
          Counts toward the <b>{cat.win_group}</b> win rate.
          {cat.cadence_quoted
            ? ` Once quoted, it's chased every ${cat.cadence_quoted} days.`
            : ' Once lodged it runs on the decision date, not a cadence.'}
        </p>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
          {isProject ? 'The project' : 'The client'}
        </div>

        <div className="grid2">
          <div className="field">
            <label htmlFor="name">{isProject ? 'Project name' : 'Company'}</label>
            <input id="name" name="name" required autoFocus />
          </div>
          <div className="field">
            <label htmlFor="site_address">Site address</label>
            <input id="site_address" name="site_address" />
            <span className="hint">Checked against open jobs so the same site isn&rsquo;t logged twice.</span>
          </div>

          {!isProject && (
            <>
              <div className="field">
                <label htmlFor="contact_name">Contact name</label>
                <input id="contact_name" name="contact_name" />
              </div>
              <div className="field">
                <label htmlFor="contact_phone">Phone</label>
                <input id="contact_phone" name="contact_phone" type="tel" />
              </div>
              <div className="field">
                <label htmlFor="contact_email">Email</label>
                <input id="contact_email" name="contact_email" type="email" />
              </div>
            </>
          )}

          {isProject && (
            <>
              <div className="field">
                <label htmlFor="closes_at">Quote closes</label>
                <input id="closes_at" name="closes_at" type="datetime-local" />
                <span className="hint">Drives countdown alerts, not the cadence.</span>
              </div>
              <div className="field">
                <label htmlFor="pc_date">Practical completion</label>
                <input id="pc_date" name="pc_date" type="date" />
                <span className="hint">Nudges at 3 weeks and 1 week out &mdash; the call a builder wants.</span>
              </div>
            </>
          )}

          <div className="field">
            <label htmlFor="source">Where it came from</label>
            <select id="source" name="source" defaultValue="EstimateOne">
              {SOURCES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="stage">Stage</label>
            <select id="stage" name="stage" defaultValue="new">
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="quoted">Quoted</option>
            </select>
          </div>
        </div>

        {isProject && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <div className="eyebrow">Builders quoting it</div>
            <p className="muted">
              They all get the same quote, so this is one job &mdash; not one per builder.
            </p>
            {builders.map((b, i) => (
              <div className="grid2" key={i}>
                <div className="field">
                  <input name="builder_name" placeholder="Builder name" defaultValue={b} />
                </div>
                <div className="field">
                  <input name="builder_contact" placeholder="Contact email" />
                </div>
              </div>
            ))}
            <div>
              <button type="button" className="btn ghost small" onClick={() => setBuilders([...builders, ''])}>
                + Add builder
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="eyebrow" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
          What it&rsquo;s worth
        </div>

        <div className="chips">
          {['oneoff', 'recurring', 'periodical'].map((b) => (
            <button
              key={b}
              type="button"
              className="chip"
              aria-pressed={billing === b}
              onClick={() => setBilling(b)}
            >
              {b === 'oneoff' ? 'One-off' : b === 'recurring' ? 'Recurring' : 'Periodical'}
            </button>
          ))}
        </div>
        <input type="hidden" name="billing" value={billing} />

        <div className="grid2">
          <div className="field">
            <label htmlFor="value_amount">
              {billing === 'oneoff'
                ? 'Quoted price (ex GST)'
                : billing === 'recurring'
                  ? 'Contract rate (ex GST)'
                  : 'Price per visit (ex GST)'}
            </label>
            <input
              id="value_amount"
              name="value_amount"
              type="number"
              min="0"
              step="10"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {billing === 'recurring' && <span className="hint">7-night sites: enter the weekly figure.</span>}
          </div>

          {billing === 'recurring' && (
            <div className="field">
              <label htmlFor="value_freq">Charged</label>
              <select
                id="value_freq"
                name="value_freq"
                value={freq}
                onChange={(e) => setFreq(Number(e.target.value))}
              >
                {FREQ.map((f) => (
                  <option key={f.v} value={f.v}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {billing === 'periodical' && (
            <div className="field">
              <label htmlFor="visits">Visits per year</label>
              <input
                id="visits"
                name="value_freq"
                type="number"
                min="1"
                max="52"
                value={visits}
                onChange={(e) => setVisits(Number(e.target.value))}
              />
              <span className="hint">Quarterly = 4, monthly = 12.</span>
            </div>
          )}
        </div>

        <div
          style={{
            borderTop: '1px solid var(--line)',
            paddingTop: 10,
            display: 'flex',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <div>
            <div className="eyebrow">Annualised value</div>
            <div className="num" style={{ fontSize: 25, fontWeight: 500, color: 'var(--good)' }}>
              {money(annual)}
            </div>
          </div>
          <p className="muted" style={{ maxWidth: '34ch' }}>
            {billing === 'oneoff'
              ? 'One-off — the annualised figure is the quoted price.'
              : `${money(amount || 0)} × ${multiplier} = what it's worth over a year. Pipeline, win rate and the leaderboard all run on this.`}
          </p>
        </div>
      </section>

      {error && <div className="notice">{error}</div>}

      <Submit />
    </form>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn" type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save & claim'}
      </button>
      <span className="muted">Saving starts the follow-up clock.</span>
    </div>
  );
}
