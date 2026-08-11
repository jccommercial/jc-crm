import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase';
import LeadForm from './LeadForm';

export const dynamic = 'force-dynamic';
// Supabase runs on fetch, which Next caches by default. A CRM showing a
// stale board is worse than a slow one.
export const fetchCache = 'force-no-store';

export default async function NewLead() {
  const sb = supabaseServer();
  const { data: categories } = await sb
    .from('categories')
    .select('*')
    .order('sort_order');

  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <header className="masthead">
        <h1>New lead</h1>
        <Link className="btn ghost small" href="/board">
          Back to board
        </Link>
      </header>

      {categories?.length ? (
        <LeadForm categories={categories} />
      ) : (
        <div className="notice">
          No categories found. Run the migration in Supabase before adding leads.
        </div>
      )}
    </main>
  );
}
