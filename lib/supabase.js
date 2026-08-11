import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Request-scoped client carrying the signed-in user's session.
 * Every query through this goes through row-level security, so a bug in a
 * query can't leak another company's data or bypass the allowlist.
 * Use this for everything the app does on behalf of a person.
 */
export function supabaseServer() {
  const store = cookies();
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(list) {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Called from a server component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to swallow.
        }
      },
    },
  });
}

/**
 * Service-role client. Bypasses RLS entirely.
 *
 * Only for work with no signed-in user: the cron tick, Gmail capture, the
 * Telegram webhook. Never import this into a client component, and never
 * use it to serve a page — if you do, RLS stops protecting anything.
 */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** The signed-in person's app_users row, or null. */
export async function currentUser() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.email) return null;

  const { data } = await sb
    .from('app_users')
    .select('*')
    .ilike('email', user.email)
    .maybeSingle();

  return data ?? null;
}
