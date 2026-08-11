'use client';

import { useState } from 'react';
import { logTouch, setStage, setAwaitingOutcome, addBuilder } from '@/app/actions';
import { LOST_REASONS, STAGES } from '@/lib/format';

export default function LeadActions({ lead, builders }) {
  const [panel, setPanel] = useState('touch');
  const [error, setError] = useState(null);
  const open = builders.filter((b) => !b.outcome);

  async function run(action, formData) {
    setError(null);
    const res = await action(formData);
    if (res?.error) setError(res.error);
    else setPanel('touch');
  }

  return (
    <section className="panel" style={{ padding: 15, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="chips">
        {[
          ['touch', 'Log touchpoint'],
          ['stage', 'Move stage'],
          ['won', 'Mark won'],
          ['lost', 'Mark lost'],
          ['pause', 'Awaiting outcome'],
          ['builder', 'Add builder'],
        ].map(([id, label]) => (
          <button key={id} type="button" className="chip" aria-pressed={panel === id} onClick={() => setPanel(id)}>
            {label}
          </button>
        ))}
      </div>

      {error && <div className="notice">{error}</div>}

      {panel === 'touch' && (
        <form action={(fd) => run(logTouch, fd)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="kind">What you did</label>
              <select id="kind" name="kind">
                <option value="call">Called</option>
                <option value="email">Emailed</option>
                <option value="visit">Visited</option>
                <option value="quote">Sent quote</option>
                <option value="other">Other</option>
              </select>
            </div>
            {open.length > 0 && (
              <div className="field">
                <label htmlFor="builder_id">Which builder</label>
                <select id="builder_id" name="builder_id" defaultValue="">
                  <option value="">— the client —</option>
                  {open.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="note">What happened</label>
            <input id="note" name="note" placeholder="One line is plenty" />
          </div>
          <div>
            <button className="btn">Log it</button>
          </div>
          <p className="muted">This is the only thing that resets the nudge clock.</p>
        </form>
      )}

      {panel === 'stage' && (
        <form action={(fd) => run(setStage, fd)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="stage">Stage</label>
            <select id="stage" name="stage" defaultValue={lead.stage}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn">Move</button>
        </form>
      )}

      {panel === 'won' && (
        <form action={(fd) => run(setStage, fd)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <input type="hidden" name="stage" value="won" />
          {open.length > 0 && (
            <div className="field">
              <label htmlFor="won_builder_id">Which builder won it?</label>
              <select id="won_builder_id" name="won_builder_id" defaultValue={open[0]?.id}>
                {open.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                The job counts once either way. The others close as not awarded &mdash; that is not a loss.
              </span>
            </div>
          )}
          <div>
            <button className="btn">Mark won</button>
          </div>
        </form>
      )}

      {panel === 'lost' && (
        <form action={(fd) => run(setStage, fd)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <input type="hidden" name="stage" value="lost" />
          <div className="grid2">
            <div className="field">
              <label htmlFor="lost_reason">Why</label>
              <select id="lost_reason" name="lost_reason" required defaultValue="">
                <option value="" disabled>
                  Pick one
                </option>
                {LOST_REASONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="lost_note">Anything worth knowing</label>
              <input id="lost_note" name="lost_note" placeholder="Optional" />
            </div>
          </div>
          <div>
            <button className="btn ghost">Mark lost</button>
          </div>
          <p className="muted">A loss without a reason is a loss you&rsquo;ll repeat.</p>
        </form>
      )}

      {panel === 'pause' && (
        <form action={(fd) => run(setAwaitingOutcome, fd)} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <div className="field" style={{ minWidth: 200 }}>
            <label htmlFor="decision_due">Decision due</label>
            <input id="decision_due" name="decision_due" type="date" required />
            <span className="hint">Pauses the cadence. One review nudge on the date.</span>
          </div>
          <button className="btn ghost">Pause it</button>
        </form>
      )}

      {panel === 'builder' && (
        <form action={(fd) => run(addBuilder, fd)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input type="hidden" name="lead_id" value={lead.id} />
          <div className="grid2">
            <div className="field">
              <label htmlFor="bname">Builder</label>
              <input id="bname" name="name" required />
            </div>
            <div className="field">
              <label htmlFor="bcontact">Contact name</label>
              <input id="bcontact" name="contact_name" />
            </div>
            <div className="field">
              <label htmlFor="bemail">Email</label>
              <input id="bemail" name="contact_email" type="email" />
            </div>
            <div className="field">
              <label htmlFor="bphone">Phone</label>
              <input id="bphone" name="contact_phone" type="tel" />
            </div>
          </div>
          <div>
            <button className="btn ghost">Add builder</button>
          </div>
          <p className="muted">
            A fourth invitation on the same scope joins this job rather than starting a second one.
          </p>
        </form>
      )}
    </section>
  );
}
