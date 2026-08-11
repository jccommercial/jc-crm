import Link from 'next/link';
import { supabaseServer, currentUser } from '@/lib/supabase';
import UserAdmin from './UserAdmin';

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
  const [{ data: users }, { data: cats }] = await Promise.all([
    sb.from('app_users').select('*').order('created_at'),
    sb.from('categories').select('*').order('sort_order'),
  ]);

  return (
    <main className="wrap" style={{ maxWidth: 820 }}>
      <header className="masthead">
        <h1>Admin</h1>
        <Link className="btn ghost small" href="/board">
          Back to board
        </Link>
      </header>

      <UserAdmin users={users ?? []} meId={me.id} />

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
