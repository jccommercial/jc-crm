import Link from 'next/link';
import { supabaseServer, currentUser } from '@/lib/supabase';
import { claimLead, signOut } from '@/app/actions';
import { money, relativeDays, shortDate, STAGES } from '@/lib/format';

export const dynamic = 'force-dynamic';
// Supabase runs on fetch, which Next caches by default. A CRM showing a
// stale board is worse than a slow one.
export const fetchCache = 'force-no-store';

const OPEN = ['new', 'contacted', 'quoted', 'followup'];

export default async function Board() {
  const me = await currentUser();
  if (!me) {
    return (
      <main className="wrap">
        <div className="notice">
          You&rsquo;re signed in but not on the staff list, so there&rsquo;s nothing to show.
          Ask Jordan to add your address.
        </div>
        <form action={signOut}>
          <button className="btn ghost">Sign out</button>
        </form>
      </main>
    );
  }

  const sb = supabaseServer();
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 86400000).toISOString();

  const [{ data: leads }, { data: queue }, { data: cats }] = await Promise.all([
    sb
      .from('leads')
      .select('*, categories(name), app_users!leads_owner_id_fkey(display_name)')
      .in('stage', OPEN)
      .order('next_nudge_at', { nullsFirst: false }),
    sb
      .from('inbox_queue')
      .select('*')
      .is('claimed_by', null)
      .eq('dismissed', false)
      .order('received_at', { ascending: false }),
    sb.from('categories').select('id, name'),
  ]);

  const all = leads ?? [];
  const due = all.filter((l) => l.next_nudge_at && new Date(l.next_nudge_at) <= now);
  const closing = all
    .filter((l) => (l.closes_at && l.closes_at <= in14) || (l.pc_date && l.pc_date <= in14.slice(0, 10)))
    .sort((a, b) => (a.closes_at || a.pc_date).localeCompare(b.closes_at || b.pc_date));

  const pipelineValue = all.reduce((sum, l) => sum + Number(l.annual_value || 0), 0);

  return (
    <main className="wrap">
      <header className="masthead">
        <h1>JC CRM</h1>
        <nav>
          <Link className="btn small" href="/leads/new">
            + New lead
          </Link>
          <Link className="btn ghost small" href="/dashboard">
            Dashboard
          </Link>
          {me.role === 'admin' && (
            <Link className="btn ghost small" href="/admin">
              Admin
            </Link>
          )}
          <form action={signOut}>
            <button className="btn ghost small">Sign out</button>
          </form>
        </nav>
      </header>

      <section style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Stat label="Open leads" value={all.length} />
        <Stat label="Pipeline, annualised" value={money(pipelineValue)} />
        <Stat label="Due to chase" value={due.length} tone={due.length ? 'bad' : 'good'} />
        <Stat label="Unclaimed" value={queue?.length ?? 0} tone={queue?.length ? 'warn' : 'good'} />
      </section>

      {/* Deadlines first: a missed close is the one unrecoverable failure. */}
      {closing.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Closing soon</h2>
            <span className="muted">Dates beat cadences.</span>
          </div>
          <div className="panel">
            {closing.map((l) => (
              <Row key={l.id} lead={l} right={l.closes_at ? `closes ${relativeDays(l.closes_at)}` : `PC ${shortDate(l.pc_date)}`} tone="warn" />
            ))}
          </div>
        </section>
      )}

      {queue && queue.length > 0 && (
        <section>
          <div className="section-head">
            <h2>Unassigned</h2>
            <span className="muted">Claim it and it&rsquo;s yours to Won or Lost.</span>
          </div>
          <div className="panel">
            {queue.map((q) => (
              <div key={q.id} className="qrow">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{q.subject}</div>
                  <div className="muted">{q.from_email}</div>
                  {q.snippet && <div className="muted">{q.snippet}</div>}
                </div>
                <form action={claimLead}>
                  <input type="hidden" name="id" value={q.id} />
                  <button className="btn small">Claim</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Chase list</h2>
          <span className="muted">
            {due.length ? 'Overdue first. Log a touch to reset the clock.' : 'Nothing due. Good.'}
          </span>
        </div>
        <div className="panel">
          {due.length === 0 && <div style={{ padding: 16 }} className="muted">All quiet.</div>}
          {due.map((l) => (
            <Row key={l.id} lead={l} right={relativeDays(l.next_nudge_at)} tone="bad" />
          ))}
        </div>
      </section>

      {STAGES.map((s) => {
        const rows = all.filter((l) => l.stage === s.id);
        if (!rows.length) return null;
        return (
          <section key={s.id}>
            <div className="section-head">
              <h2>
                {s.label} <span className="muted num">{rows.length}</span>
              </h2>
              <span className="muted num">
                {money(rows.reduce((t, l) => t + Number(l.annual_value || 0), 0))}
              </span>
            </div>
            <div className="panel">
              {rows.map((l) => (
                <Row
                  key={l.id}
                  lead={l}
                  right={
                    l.awaiting_outcome
                      ? `decision ${shortDate(l.decision_due)}`
                      : l.next_nudge_at
                        ? relativeDays(l.next_nudge_at)
                        : '—'
                  }
                />
              ))}
            </div>
          </section>
        );
      })}

      {all.length === 0 && (
        <p className="muted">
          Nothing in here yet. <Link href="/leads/new">Add the first lead</Link>.
        </p>
      )}

      <p className="muted">
        Signed in as {me.display_name}
        {me.role === 'admin' ? ' (admin)' : ''} &middot; {cats?.length ?? 0} categories
      </p>
    </main>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div
        className="num"
        style={{
          fontSize: 26,
          fontWeight: 500,
          color: tone ? `var(--${tone})` : 'var(--ink)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Row({ lead, right, tone }) {
  return (
    <Link href={`/leads/${lead.id}`} className="lrow">
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{lead.name}</div>
        <div className="muted">
          {lead.categories?.name}
          {lead.app_users?.display_name ? ` · ${lead.app_users.display_name}` : ''}
          {lead.site_address ? ` · ${lead.site_address}` : ''}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <div className="num" style={{ fontWeight: 500 }}>
          {money(lead.annual_value)}
        </div>
        <div className="muted" style={{ color: tone ? `var(--${tone})` : undefined }}>
          {right}
        </div>
      </div>
    </Link>
  );
}
