'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const REASONS = {
  wrong_browser:
    'That link was opened in a different browser to the one that asked for it. Request a fresh link here, then open it in this same browser.',
  link_expired: 'That link has expired or was already used. Request a new one.',
  missing_code: 'That link was incomplete. Request a new one.',
  not_on_staff_list:
    'That address isn’t on the staff list, so there’s nothing to show. Ask Jordan to add it.',
};

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);

  // Surface why the last attempt failed, in words rather than a query string.
  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('error');
    if (reason) setError(REASONS[reason] ?? 'Sign-in failed. Request a new link.');
  }, []);

  async function send(e) {
    e.preventDefault();
    setState('sending');
    setError(null);

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Nobody signs themselves up. Accounts come from the app_users
        // allowlist, so an unknown address gets no email at all.
        shouldCreateUser: true,
      },
    });

    if (error) {
      setError(error.message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 400, paddingTop: 80 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 680, letterSpacing: '-0.025em' }}>JC CRM</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Enter the email address you were added with. We&rsquo;ll send a link &mdash; no
          password to remember.
        </p>
      </div>

      {state === 'sent' ? (
        <div className="notice ok">
          Check your inbox. The link signs you straight in and expires in an hour.
        </div>
      ) : (
        <form onSubmit={send} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {error && <div className="notice">{error}</div>}

          <button className="btn" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending…' : 'Send sign-in link'}
          </button>

          <p className="muted">
            Any email address works &mdash; work, personal, or contractor &mdash; but it has to
            be on the staff list first. If yours isn&rsquo;t, ask Jordan to add it.
          </p>
        </form>
      )}
    </main>
  );
}
