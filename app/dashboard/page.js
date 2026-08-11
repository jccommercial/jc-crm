import Link from 'next/link';
import { supabaseServer, currentUser } from '@/lib/supabase';
import { money, moneyShort, shortDate } from '@/lib/format';
import Ring from './Ring';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export default async function Dashboard() {
  const me = await currentUser();
  if (!me) return <main className="wrap"><div className="notice">Not on the staff list.</div></main>;

  const sb = supabaseServer();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthKey = monthStart.slice(0, 10);

  const [{ data: leads }, { data: winRate }, { data: board }, { data: spend }, { data: settings }] =
    await Promise.all([
      sb.from('leads').select('id, name, stage, annual_value, closed_at, created_at, source, app_users!leads_owner_id_fkey(display_name)'),
      sb.from('v_win_rate').select('*'),
      sb.from('v_leaderboard').select('*'),
      sb.from('channel_spend').select('*').eq('month', monthKey),
      sb.from('settings').select('key, value'),
    ]);

  const S = Object.fromEntries((settings ?? []).map((r) => [r.key, Number(r.value)]));
  const target = S.monthly_target ?? 180000;
  const tallyThreshold = S.tally_threshold ?? 8;

  const all = leads ?? [];
  const open = all.filter((l) => !['won', 'lost'].includes(l.stage));
  const wonThisMonth = all.filter((l) => l.stage === 'won' && l.closed_at >= monthStart);
  const newThisMonth = all.filter((l) => l.created_at >= monthStart);

  const wonValue = wonThisMonth.reduce((t, l) => t + Number(l.annual_value || 0), 0);
  const pipeline = open.reduce((t, l) => t + Number(l.annual_value || 0), 0);
  const pct = target ? Math.min(100, Math.round((wonValue / target) * 100)) : 0;

  const totalSpend = (spend ?? []).reduce((t, r) => t + Number(r.spend || 0), 0);
  const totalClicks = (spend ?? []).reduce((t, r) => t + Number(r.clicks || 0), 0);
  const cpl = newThisMonth.length && totalSpend ? totalSpend / newThisMonth.length : null;
  const cpc = totalClicks && totalSpend ? totalSpend / totalClicks : null;

  const ranked = (board ?? [])
    .filter((r) => Number(r.value_30d) > 0)
    .sort((a, b) => Number(b.value_30d) - Number(a.value_30d));
  const topValue = ranked.length ? Number(ranked[0].value_30d) : 0;

  const recentWins = all
    .filter((l) => l.stage === 'won')
    .sort((a, b) => (b.closed_at || '').localeCompare(a.closed_at || ''))
    .slice(0, 5);

  const groups = ['tendered', 'inbound'];

  return (
    <main className="wrap">
      <header className="masthead">
        <h1>Dashboard</h1>
        <nav>
          <Link className="btn ghost small" href="/board">Board</Link>
          {me.role === 'admin' && <Link className="btn ghost small" href="/admin">Admin</Link>}
        </nav>
      </header>

      {/* Team number first: one bar, everyone filling it. */}
      <section className={`panel teambar${pct >= 100 ? ' hit' : ''}`}>
        <div className="teambar-head">
          <div>
            <div className="eyebrow">
              {now.toLocaleDateString('en-AU', { month: 'long' })} — won, annualised
            </div>
            <div className="teambar-figure">
              <span className="num big">{money(wonValue)}</span>
              <span className="num of">of {money(target)}</span>
            </div>
          </div>
          <span className={`pill ${pct >= 100 ? 'good' : pct >= 60 ? 'warn' : 'flat'}`}>
            {pct}% there
          </span>
        </div>
        <div className="track">
          {ranked.length === 0 ? (
            <span style={{ width: '0%' }} />
          ) : (
            ranked.map((r) => (
              <span key={r.user_id} style={{ width: `${(Number(r.value_30d) / target) * 100}%` }} />
            ))
          )}
        </div>
        {ranked.length === 0 && (
          <p className="muted">Nothing won yet this month. The bar fills as jobs close.</p>
        )}
      </section>

      <section className="tiles">
        <Tile label="Cost per lead" value={cpl ? money(cpl) : '—'}
          sub={cpl ? `${newThisMonth.length} leads this month` : 'no spend recorded'}
          state={cpl ? 'flat' : 'empty'} />
        <Tile label="Cost per click" value={cpc ? `$${cpc.toFixed(2)}` : '—'}
          sub={cpc ? `${totalClicks.toLocaleString('en-AU')} clicks` : 'no spend recorded'}
          state={cpc ? 'flat' : 'empty'} />
        <Tile label="Won this month" value={moneyShort(wonValue)}
          sub={`${wonThisMonth.length} ${wonThisMonth.length === 1 ? 'job' : 'jobs'}`}
          state={wonValue > 0 ? 'good' : 'empty'} />
        <Tile label="Open pipeline" value={moneyShort(pipeline)}
          sub={`${open.length} live leads`} state="flat" />
      </section>

      {/* Win rate: per category, tally where the sample is too thin for a %. */}
      <section>
        <div className="section-head">
          <h2>Win rate</h2>
          <span className="muted">
            Company-wide. Anything with under {tallyThreshold} closed jobs shows a tally, not a
            percentage.
          </span>
        </div>

        <div className="split-wr">
          {groups.map((g) => {
            const rows = (winRate ?? []).filter((r) => r.win_group === g);
            const won = rows.reduce((t, r) => t + Number(r.won), 0);
            const closed = rows.reduce((t, r) => t + Number(r.closed), 0);
            const groupPct = closed ? Math.round((won / closed) * 100) : null;
            const groupTarget = g === 'tendered' ? 27 : 60;
            const state = groupPct === null ? 'empty'
              : groupPct >= groupTarget ? 'good'
              : groupPct >= groupTarget * 0.7 ? 'warn' : 'bad';

            return (
              <div className="panel wr-card" key={g}>
                <Ring pct={groupPct} target={groupTarget} state={state} label={g} closed={closed} />
                <div className="breakdown">
                  {rows.map((r) => {
                    const won = Number(r.won);
                    const lost = Number(r.lost);
                    const openN = Number(r.open);
                    const closed = won + lost;
                    const tally = r.show_as_tally || closed < tallyThreshold;
                    const rowPct = r.win_pct === null ? null : Number(r.win_pct);
                    const rowState = rowPct === null ? 'empty'
                      : rowPct >= r.win_target_pct ? 'good'
                      : rowPct >= r.win_target_pct * 0.7 ? 'warn' : 'bad';

                    return (
                      <div className="bd-row" data-state={rowState} key={r.category_id}>
                        <div>
                          <div className="bd-label">
                            {r.name}
                            {/* Only worth saying when there's something to count. */}
                            {tally && closed > 0 && (
                              <span className="pill flat">too few for a %</span>
                            )}
                          </div>

                          {closed === 0 ? (
                            // Nothing has closed. A row of dashes here looks like
                            // data; a sentence says what's actually true.
                            <div className="bd-empty">
                              {openN > 0
                                ? `nothing closed yet — ${openN} still open`
                                : 'nothing quoted yet'}
                            </div>
                          ) : tally ? (
                            <div className="bd-tally">
                              {Array.from({ length: won }).map((_, i) => (
                                <span className="bd-box won" key={`w${i}`}>W</span>
                              ))}
                              {Array.from({ length: lost }).map((_, i) => (
                                <span className="bd-box lost" key={`l${i}`}>L</span>
                              ))}
                              {openN > 0 && (
                                <span className="bd-open-note">+{openN} open</span>
                              )}
                            </div>
                          ) : (
                            <div className="bd-track">
                              <i style={{ width: `${rowPct}%` }} />
                              <u style={{ left: `${r.win_target_pct}%` }} />
                            </div>
                          )}
                        </div>
                        <div className="bd-pct">
                          {closed === 0 ? <span className="muted">—</span>
                            : tally ? `${won}W ${lost}L`
                            : `${rowPct}%`}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="split-wr">
        <div>
          <div className="section-head">
            <h2>Leaderboard — 30 days</h2>
            <span className="muted">Wins only.</span>
          </div>
          <div className="panel">
            {ranked.length === 0 && (
              <div style={{ padding: 16 }} className="muted">
                No wins in the last 30 days. Mark one won and it appears here.
              </div>
            )}
            {ranked.map((r, i) => (
              <div className={`row${i === 0 ? ' lead' : ''}`} key={r.user_id}>
                <div className="row-rank">{i + 1}</div>
                <div className="row-name">
                  <strong>{r.display_name}</strong>
                  <div className="row-bar">
                    <i style={{ width: `${(Number(r.value_30d) / topValue) * 100}%` }} />
                  </div>
                </div>
                <div className="row-val">
                  <span className="num money">{money(r.value_30d)}</span>
                  <span className="wins num">
                    {r.wins_30d} {Number(r.wins_30d) === 1 ? 'win' : 'wins'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="section-head">
            <h2>Recent wins</h2>
          </div>
          <div className="panel">
            {recentWins.length === 0 && (
              <div style={{ padding: 16 }} className="muted">Nothing closed yet.</div>
            )}
            {recentWins.map((w) => (
              <div className="ticker-item" key={w.id}>
                <div>
                  <div>{w.name}</div>
                  <div className="muted">
                    {w.app_users?.display_name} · {shortDate(w.closed_at)}
                  </div>
                </div>
                <div className="num amt">{money(w.annual_value)}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <p className="muted">
        Losses are recorded but never shown here.
        {me.role === 'admin' && <> They&rsquo;re on the <Link href="/admin">admin page</Link>.</>}
      </p>
    </main>
  );
}

function Tile({ label, value, sub, state }) {
  return (
    <div className="panel tile" data-state={state}>
      <span className="eyebrow">{label}</span>
      <div className="num tile-figure">{value}</div>
      <div className="tile-sub">{sub}</div>
    </div>
  );
}
