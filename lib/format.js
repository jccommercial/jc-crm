const AUD = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  maximumFractionDigits: 0,
});

export function money(n) {
  return AUD.format(Number(n) || 0);
}

/** Compact form for tiles: $60.1k */
export function moneyShort(n) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return '$' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return money(v);
}

export function daysBetween(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}

/** "in 4 days" / "3 days ago" / "today" */
export function relativeDays(when) {
  if (!when) return null;
  const d = daysBetween(when, new Date());
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

export function shortDate(when) {
  if (!when) return null;
  return new Date(when).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
  });
}

export function dateTime(when) {
  if (!when) return null;
  return new Date(when).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export const STAGES = [
  { id: 'new', label: 'New' },
  { id: 'contacted', label: 'Contacted' },
  { id: 'quoted', label: 'Quoted' },
  { id: 'followup', label: 'Follow-up' },
];

export const LOST_REASONS = [
  { id: 'price', label: 'Price' },
  { id: 'timing', label: 'Timing' },
  { id: 'no_response', label: 'No response' },
  { id: 'went_internal', label: 'Went internal' },
  { id: 'other', label: 'Other' },
];

/**
 * Annualised value. Mirrors the generated column in Postgres so the form can
 * show the figure live before saving. The database remains the authority.
 */
export function annualise(billing, amount, freq) {
  const a = Number(amount) || 0;
  if (billing === 'oneoff') return a;
  return a * (Number(freq) || 0);
}
