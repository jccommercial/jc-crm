'use client';

import { useState } from 'react';
import { saveSpend } from '@/app/actions';
import { money } from '@/lib/format';

const CHANNELS = ['Google Ads', 'Meta', 'EstimateOne', 'Other'];

export default function SpendAdmin({ spend }) {
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const thisMonth = new Date().toISOString().slice(0, 7);

  async function run(formData) {
    setErr(null);
    setMsg(null);
    const res = await saveSpend(formData);
    if (res?.error) setErr(res.error);
    else setMsg(res?.message);
  }

  return (
    <section>
      <div className="section-head">
        <h2>Ad spend</h2>
        <span className="muted">Feeds cost per lead and cost per click. Nothing else uses it.</span>
      </div>

      {spend.length > 0 && (
        <div className="panel" style={{ marginBottom: 12 }}>
          {spend.map((r) => (
            <div className="brow" key={`${r.month}-${r.channel}`}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.channel}</div>
                <div className="muted">{r.month.slice(0, 7)}</div>
              </div>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <span className="num">{money(r.spend)}</span>
                <span className="muted num">{Number(r.clicks).toLocaleString('en-AU')} clicks</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {err && <div className="notice" style={{ marginBottom: 10 }}>{err}</div>}
      {msg && <div className="notice ok" style={{ marginBottom: 10 }}>{msg}</div>}

      <form action={run} className="panel" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid2">
          <div className="field">
            <label htmlFor="s-month">Month</label>
            <input id="s-month" name="month" type="month" defaultValue={thisMonth} required />
          </div>
          <div className="field">
            <label htmlFor="s-channel">Channel</label>
            <select id="s-channel" name="channel" defaultValue="Google Ads">
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="s-spend">Spend (ex GST)</label>
            <input id="s-spend" name="spend" type="number" min="0" step="1" defaultValue="0" />
          </div>
          <div className="field">
            <label htmlFor="s-clicks">Clicks</label>
            <input id="s-clicks" name="clicks" type="number" min="0" step="1" defaultValue="0" />
            <span className="hint">Leave 0 if you only track spend &mdash; CPL still works.</span>
          </div>
        </div>
        <div>
          <button className="btn">Save month</button>
        </div>
        <p className="muted">
          Saving the same month and channel again overwrites it, so you can correct a figure
          without creating a duplicate.
        </p>
      </form>
    </section>
  );
}
