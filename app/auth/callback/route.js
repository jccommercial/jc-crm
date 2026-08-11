import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Magic-link landing.
 *
 * Supabase sends one of two link shapes depending on the project's email
 * template, and they fail in different ways:
 *
 *   ?code=...        PKCE. Secure, but the verifier lives in a cookie in the
 *                    browser that asked for the link — open it somewhere else
 *                    and the exchange fails.
 *   ?token_hash=...  Works in any browser, which is what people actually do
 *                    when the link lands on their phone.
 *
 * Both are handled, token_hash first, so a link opened on a different device
 * still signs you in.
 */
export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') || 'email';
  const next = searchParams.get('next') || '/board';

  const supabase = supabaseServer();
  let authError = null;

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    authError = error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    authError = error;
    // A PKCE failure is almost always "opened in a different browser", which
    // is worth saying rather than the useless "expired".
    if (error) {
      return NextResponse.redirect(`${origin}/login?error=wrong_browser`);
    }
  } else {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  if (authError) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Supabase will create an auth user for any address that receives a link.
  // The allowlist decides whether that user sees anything.
  const { data: staff } = await supabase
    .from('app_users')
    .select('id, active')
    .ilike('email', user?.email ?? '')
    .maybeSingle();

  if (!staff || !staff.active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_on_staff_list`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
