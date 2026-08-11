'use client';

import { useState } from 'react';
import { addUser, setUserActive } from '@/app/actions';

export default function UserAdmin({ users, meId }) {
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  async function run(action, formData) {
    setError(null);
    setOk(null);
    const res = await action(formData);
    if (res?.error) setError(res.error);
    else if (res?.message) setOk(res.message);
  }

  return (
    <section>
      <div className="section-head">
        <h2>Who can get in</h2>
        <span className="muted">{users.length} on the list</span>
      </div>

      <div className="panel">
        {users.map((u) => (
          <div className="brow" key={u.id} style={{ borderTop: '1px solid var(--line)' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                {u.display_name}{' '}
                {u.role === 'admin' && <span className="pill flat">admin</span>}
                {!u.active && <span className="pill bad">off</span>}
              </div>
              <div className="muted">
                {u.email}
                {u.telegram_user_id ? ' · Telegram linked' : ' · no Telegram yet'}
              </div>
            </div>
            {u.id !== meId && (
              <form action={(fd) => run(setUserActive, fd)}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="active" value={u.active ? 'false' : 'true'} />
                <button className="btn ghost small">{u.active ? 'Turn off' : 'Turn on'}</button>
              </form>
            )}
          </div>
        ))}
      </div>

      {error && <div className="notice" style={{ marginTop: 10 }}>{error}</div>}
      {ok && <div className="notice ok" style={{ marginTop: 10 }}>{ok}</div>}

      <form
        action={(fd) => run(addUser, fd)}
        className="panel"
        style={{ marginTop: 12, padding: 15, display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div className="eyebrow">Add someone</div>
        <div className="grid2">
          <div className="field">
            <label htmlFor="u-name">Name</label>
            <input id="u-name" name="display_name" required placeholder="Cameron" />
          </div>
          <div className="field">
            <label htmlFor="u-email">Email</label>
            <input id="u-email" name="email" type="email" required placeholder="anything@anywhere.com" />
            <span className="hint">
              Any address &mdash; work, personal, contractor. This list is the only gate.
            </span>
          </div>
          <div className="field">
            <label htmlFor="u-role">Role</label>
            <select id="u-role" name="role" defaultValue="member">
              <option value="member">Member &mdash; leads and follow-up</option>
              <option value="admin">Admin &mdash; also settings, users, loss data</option>
            </select>
          </div>
        </div>
        <div>
          <button className="btn">Add to the list</button>
        </div>
        <p className="muted">
          They sign in at the login page with that address. Nothing is emailed automatically
          &mdash; send them the link yourself.
        </p>
      </form>
    </section>
  );
}
