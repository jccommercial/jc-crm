import Link from 'next/link';
import { supabaseServer, currentUser } from '@/lib/supabase';
import { money, shortDate } from '@/lib/format';
import UserAdmin from './UserAdmin';
import SpendAdmin from './SpendAdmin';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function AdminPage() {
  const me = await currentUser();

  // The page is admin-only, but so are the underlying tables: RLS refuses the
  // writes even if someone reaches this URL another way.
  if (!me || me.role !== 'admin') {
    return (
      <main className="wrap">
        <div className="notice">Admins only.</div>
        <Link className="btn ghost" href="/board">
          Back to board
        </Link>
      </main>
    );
  }

  const sb = supabaseServer();
  const [{ data: users }, { data: cats }, { data: losses }, { data: personRate }, { data: spend }] =
    await Promise.all([
      sb.from('app_users').select('*').order('created_at'),
      sb.from('categories').select('*').order('sort_order'),
      sb.from('v_losses').select('*').order('closed_at', { ascending: false }),
      sb.from('v_person_win_rate').select('*'),
      sb.from('channel_spend').select('*').order('month', { ascending: false }).limit(12),
    ]);

  const lostValue = (losses ?? []).reduce((t, l) => t + Number(l.annual_value || 0), 0);
  const REASONS = { price: 'Price', timing: 'Timing', no_response: 'No response', went_internal: 'Went internal', other: 'Other / not given' };

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <header className="masthead">
        <h1>Admin</h1>
        <Link className="btn ghost small" href="/board">
          Back to board
        </Link>
      </header>

      <UserAdmin users={users ?? []} meId={me.id} />

      {/* Everything below is deliberately absent from the dashboard and the
          leaderboard. It's here because you need it for pricing decisions,
          not because the floor should see it. */}
      <section>
        <div className="section-head">
          <h2>Losses</h2>
          <span className="muted">
            {losses?.length ?? 0} recorded &middot; {money(lostValue)} annualised &middot; admin only
          </span>
        </div>
        <div className="panel">
          {!losses?.length && (
            <div style={{ padding: 16 }} className="muted">
              Nothing recorded as lost yet.
            </div>
          )}
          {losses?.map((l) => (
            <div className="brow" key={l.id}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.name}</div>
                <div className="muted">
                  {l.category} &middot; {l.owner ?? 'unassigned'} &middot; {shortDate(l.closed_at)}
                </div>
                {l.lost_note && (
                  <div className="muted" style={{ marginTop: 3 }}>{l.lost_note}</div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className={`pill ${l.lost_reason === 'other' ? 'warn' : 'bad'}`}>
                  {REASONS[l.lost_reason] ?? l.lost_reason}
                </span>
                <span className="num" style={{ fontWeight: 500 }}>{money(l.annual_value)}</span>
              </div>
            </div>
          ))}
        </div>
        {losses?.some((l) => l.lost_reason === 'other') && (
          <p className="muted" style={{ marginTop: 8 }}>
            The amber ones have no stated reason. A loss without a reason is a loss you can&rsquo;t
            learn from &mdash; those are the debriefs worth chasing.
          </p>
        )}
      </section>

      <section>
        <div className="section-head">
          <h2>Win rate by person</h2>
          <span className="muted">Admin only &mdash; publishing this is publishing their losses.</span>
        </div>
        <div className="panel">
          {!personRate?.length && (
            <div style={{ padding: 16 }} className="muted">Nothing closed yet.</div>
          )}
          {personRate?.map((p) => (
            <div className="brow" key={p.display_name}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.display_name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="muted num">{p.won}W &middot; {p.lost}L</span>
                <span className="num" style={{ fontWeight: 500 }}>
                  {p.win_pct === null ? '—' : `${p.win_pct}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <SpendAdmin spend={spend ?? []} />

      <section>
        <div className="section-head">
          <h2>Categories</h2>
          <span className="muted">Cadence in days. Change these here, no deploy needed.</span>
        </div>
        <div className="panel" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr>
                {['Category', 'Group', 'New', 'Contacted', 'Quoted', 'Follow-up', 'Target'].map((h) => (
                  <th
                    key={h}
                    className="eyebrow"
                    style={{
                      textAlign: h === 'Category' || h === 'Group' ? 'left' : 'right',
                      padding: '8px 12px',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cats?.map((c) => (
                <tr key={c.id}>
                  <td style={cell}>{c.name}</td>
                  <td style={cell}>{c.win_group}</td>
                  <td style={num}>{c.cadence_new ?? '—'}</td>
                  <td style={num}>{c.cadence_contacted ?? '—'}</td>
                  <td style={num}>{c.cadence_quoted ?? 'date'}</td>
                  <td style={num}>{c.cadence_followup ?? 'date'}</td>
                  <td style={num}>{c.win_target_pct ? `${c.win_target_pct}%` : 'tally'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 8 }}>
          Government tenders show <b>tally</b> rather than a target: at roughly one SA
          opportunity a month, a percentage off that sample is noise.
        </p>
      </section>
    </main>
  );
}

const cell = { padding: '9px 12px', borderBottom: '1px solid var(--line)' };
const num = {
  ...cell,
  textAlign: 'right',
  fontFamily: 'var(--mono)',
  fontVariantNumeric: 'tabular-nums',
};
