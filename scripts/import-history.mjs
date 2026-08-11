/**
 * One-off import of JC's real quote history into the CRM.
 *
 * Sources: OUTPUTS/Quote Pipeline/seed.js (built 5 Aug from the quote folders),
 * OUTPUTS/Quote Pipeline/WIN-LOSS-LEDGER.md, and the quotes issued since.
 *
 * created_at is set to the date the quote actually went out, which matters:
 * the insert trigger computes next_nudge_at from it, so the chase dates come
 * out where they genuinely fall rather than all landing today.
 *
 *   node scripts/import-history.mjs          # dry run, prints what it would do
 *   node scripts/import-history.mjs --commit # writes
 */

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const URL_ = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const COMMIT = process.argv.includes('--commit');

const H = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${URL_}/rest/v1/${path}`, { ...opts, headers: H });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${path}: ${text}`);
  return text ? JSON.parse(text) : null;
};

/* ---------------------------------------------------------------- the data */

const T = 'tendering builders';

// Builders cleans. All one-off, all issued to a field of builders.
const BUILDERS = [
  ['Galipo Foods Warehouse',           27800, '2026-07-20', null, 'Cold-room sequencing. Food-distribution facility.'],
  ['75 South Tce Apartments',          26800, '2026-07-20', '75 South Tce, Adelaide', '15-residence boutique tower, priced per unit.'],
  ['Bendigo Bank 80 Grenfell',         21400, '2026-07-20', '80 Grenfell St, Adelaide', 'Addendums still landing as at 6 Aug — head tender not closed.'],
  ['Bunnings Prospect',                14800, '2026-07-20', 'Prospect SA', 'Big-box store. National builder = repeat-store pipeline.', ['H.Troon']],
  ['Links Hotel Seaton',               17200, '2026-08-07', 'Seaton SA 5023', '43 guest rooms. First per-room builders clean.'],
  ['Richmond Oval (2 stages)',         10200, '2026-08-03', 'Richmond SA', 'Two-stage sports facility. Textured tile slows grout haze.'],
  ['Davoren Park Community Centre',     9280, '2026-07-20', 'Davoren Park SA', 'Asbestos risk — no register in the set.'],
  ['Scotch College Stephenson Wing',    9000, '2026-08-03', 'Torrens Park SA', 'Heritage conservation. First lead-paint exclusion.'],
  ['Dwight Reserve Clubroom',           7480, '2026-07-20', null, 'Acid-wash allowance. IPP selling point for council work.'],
  ['AFC West Wing Admin Fitout',        7400, '2026-08-05', 'Adelaide Festival Centre', 'Sheer curtains are a sequencing clause.'],
  ['923 Stebonheath Rd (7 homes)',      6860, '2026-07-20', '923 Stebonheath Rd, Munno Para West', 'Seven spec homes, staged completion rates.'],
  ['Cumberland Hotel Glanville',        6300, '2026-07-16', 'Glanville SA', 'Pub reno ~$6/m². Post-opening recurring + AS 1851 canopy target.'],
  ['St Francis Assisi Gym (Renmark)',   6240, '2026-07-20', 'Renmark SA', 'Travel priced in. Direct invitation.', ['Harrold & Kite']],
  ['87 Commercial Rd Port Adelaide',    6200, '2026-08-06', '87 Commercial Rd, Port Adelaide', 'Four dual-level apartments. DA-stage set — finishes clause is the protection.'],
  ['TSA Golden Grove Corps',            5280, '2026-07-16', 'Golden Grove SA', 'Replied 29 Jul asking for staged split S1 $2,280 / S2 $3,400.', ['Chappell Builders']],
  ['Encounter Lutheran College',        5080, '2026-07-16', null, 'Issued to 4 tendering builders.'],
  ['DASSA Edinburgh North',             4840, '2026-07-16', 'Edinburgh North SA', 'Clinical fit-out. First rate-card-priced quote.'],
  ['St Mary Magdalene Stage 1A',        4550, '2026-07-29', null, 'Tender closed 30 Jul 4pm. Second H&K invitation.', ['Harrold & Kite']],
  ['SCC Glen Woodley Kitchen',          4500, '2026-08-03', null, 'Aged-care kitchen + servery. SA/NT/VIC multi-site door-opener.'],
  ['Chartered Accountants L29',         4200, '2026-08-06', 'Adelaide CBD', 'Bodaq film is not wallpaper. SD vinyl never coated.'],
  ['SAPN Angle Park Training',          3900, '2026-07-20', 'Angle Park SA', 'Asbestos register named in the quote.'],
  // Address left blank deliberately: the pipeline file says Prospect, the quote
  // thread said Wayville. Better empty than wrong — you can set it in the app.
  ['LMS Energy Office Fitout',          3850, '2026-07-29', null, 'Two-level office fit-out. Acoustic curtains and pinboards are a dry-only trap.'],
  ['Strathmore Hotel Refurb',           3850, '2026-08-06', '129 North Tce, Adelaide', 'JC already holds the daily clean — defensive. Polysafe Apex needs a scrub not a mop.'],
  ['120 Rundle St Kent Town',           3240, '2026-07-20', '120 Rundle St, Kent Town', 'Heritage residence + clinic. Resi band $9-12/m².'],
  ['St Patricks Special School',        2850, '2026-08-03', null, 'Epoxy grout defeats acid haze remover. H&K need 90-day validity.', ['Harrold & Kite']],
  ['Flinders Central Library Stage 2',  2720, '2026-07-20', 'Bedford Park SA', 'Uni client = campus door-opener.'],
  ['Rabobank Adelaide L5',              2640, '2026-07-13', 'Adelaide CBD L5', 'Via Cushman & Wakefield tender.', ['Cushman & Wakefield']],
  ['6 KWR Wayville Suite',              2480, '2026-07-20', '6 King William Rd, Wayville', 'Specialist suite. Medical recurring-clean tail.'],
  ['Shapeshifter Brewery',              2450, '2026-08-07', 'Adelaide Central Market', 'First quote off a Full Set. 47mm mosaic drops grout-haze to 22 m²/hr.'],
  ['Our Lady of La Vang Hall',          2280, '2026-08-07', null, 'Taraflex sports vinyl + court line marking — never scrub or seal.'],
  ['Tea Tree Gully Croquet Clubrooms',  2260, '2026-08-07', 'Tea Tree Gully SA', 'Shed is a separable awardable row.'],
  ['Elders Virginia Redevelopment',     2180, '2026-07-16', 'Virginia SA', '40% GM now standard on builders cleans.'],
  ['Goodstart ELC Evanston Park',       2150, '2026-08-03', 'Evanston Park SA', '19 m² — hours not $/m². Food-safe pass priced in.', ['MYKRA']],
  ['SA Skills Commissioner Fitout',     1880, '2026-07-20', '55 Currie St, Adelaide', 'Three builders invited on the same scope.', ['Horizon Construction', 'Mossop Group', 'Partek Projects']],
  ['AAL REX Airside SP1 + SP4',         1480, '2026-07-20', 'Adelaide Airport', 'Demolition added by addendum. Airport = precinct door-opener.'],
];

// Direct work — no builder in the middle.
const DIRECT = [
  ['Canteen Kitchen Deep Clean', 'oneoff', 4400, 1, '2026-07-22', 'quoted', 'Referral',
    'Equipserve (Jarrad Brown) — wholesale, 3 packages. Jarrad can say yes without a head contract.'],
  ['Ceduna QSR Hood Clean', 'oneoff', 4000, 1, '2026-08-04', 'contacted', 'Referral',
    'Via Jared. Estimate $3,800-4,200. Cameron solo 2 nights, ~$2,415 direct cost. Roof access TBC.'],
  ['Anytime Fitness Port Pirie', 'daily', 1155, 52, '2026-08-10', 'quoted', 'Referral',
    'Rev 1, down from $1,246/wk. 7-night gym. 36.7% margin; 35% floor breaks above a $39/hr local contractor rate.'],
];

// Lodged tenders — paused on a decision date, not chased on a cadence.
const TENDERS = [
  ['SAJC Morphettville', 'private', 238333.33, 12, '2026-07-31', '2026-11-28',
    'Lodged at $2.86M/yr. Valid to ~28 Nov. If-won runbook written.'],
  ['DEM Soft FM SR2526-215', 'govt', 12366.83, 12, '2026-08-04', '2026-09-30',
    'Lodged at $148,402/yr. Outcome expected ~Sep.'],
];

// Closed. Two of three reasons are still unknown — recorded as such, not guessed.
const LOSSES = [
  ['Bower Education — 5 ELCs', 'private', 43800, 12, '2026-07-17', 'other',
    'Option A full spec $525,600/yr. Reason NOT GIVEN — debrief chased, not received. Incumbent Jan-Pro.'],
  ['Zenith FM — 15 medical clinics', 'private', 69833.33, 12, '2026-07-01', 'price',
    'Zenith went cheaper. Called JC cheap in negotiation and still went lower. Priced correctly, lost to a rate-buyer.'],
  ['RM Williams multi-site', 'private', 91727, 12, '2026-07-16', 'other',
    'Option 1 $1,100,725/yr. Reason NOT GIVEN — debrief chased, not received. Largest opportunity priced outside SAJC.'],
];

/* -------------------------------------------------------------- the import */

const rows = [];

for (const [name, value, sent, site, note, builders] of BUILDERS) {
  rows.push({
    lead: {
      name, site_address: site, category_id: 'builders', billing: 'oneoff',
      value_amount: value, value_freq: 1, stage: 'quoted',
      source: 'EstimateOne', created_at: `${sent}T09:00:00+09:30`,
    },
    note, builders: builders ?? [],
  });
}

for (const [name, cat, amount, freq, sent, stage, source, note] of DIRECT) {
  rows.push({
    lead: {
      name, category_id: cat, billing: cat === 'daily' ? 'recurring' : 'oneoff',
      value_amount: amount, value_freq: freq, stage, source,
      created_at: `${sent}T09:00:00+09:30`,
    },
    note, builders: [],
  });
}

for (const [name, cat, monthly, freq, lodged, decision, note] of TENDERS) {
  rows.push({
    lead: {
      name, category_id: cat, billing: 'recurring',
      value_amount: monthly, value_freq: freq, stage: 'quoted',
      source: 'Other', awaiting_outcome: true, decision_due: decision,
      created_at: `${lodged}T09:00:00+09:30`,
    },
    note, builders: [],
  });
}

for (const [name, cat, monthly, freq, sent, reason, note] of LOSSES) {
  rows.push({
    lead: {
      name, category_id: cat, billing: 'recurring',
      value_amount: monthly, value_freq: freq, stage: 'lost',
      lost_reason: reason, lost_note: note, source: 'Other',
      created_at: `${sent}T09:00:00+09:30`,
    },
    note, builders: [],
  });
}

const [me] = await api('app_users?select=id&email=eq.jordan@jccommercial.com.au');

console.log(`${rows.length} leads to import`);
console.log(`  builders cleans : ${BUILDERS.length}`);
console.log(`  direct work     : ${DIRECT.length}`);
console.log(`  lodged tenders  : ${TENDERS.length}`);
console.log(`  recorded losses : ${LOSSES.length}`);
console.log(`  named builders  : ${BUILDERS.filter((b) => b[5]).length} projects`);

if (!COMMIT) {
  console.log('\nDry run. Re-run with --commit to write.');
  process.exit(0);
}

let ok = 0;
for (const { lead, note, builders } of rows) {
  try {
    const [created] = await api('leads', {
      method: 'POST',
      body: JSON.stringify({ ...lead, owner_id: me.id, created_by: me.id }),
    });

    if (builders.length) {
      await api('lead_builders', {
        method: 'POST',
        body: JSON.stringify(builders.map((b) => ({ lead_id: created.id, name: b }))),
      });
    }

    // The quote going out is itself the first touchpoint. Logged as such so the
    // history is honest rather than every lead showing zero contact.
    if (lead.stage !== 'new') {
      await api('touchpoints', {
        method: 'POST',
        body: JSON.stringify({
          lead_id: created.id, user_id: me.id, kind: 'quote',
          note: note ?? 'Quote issued', created_at: lead.created_at,
        }),
      });
    }

    ok++;
    console.log(`  ok  ${lead.name}`);
  } catch (err) {
    console.log(`  FAIL ${lead.name}: ${err.message.slice(0, 120)}`);
  }
}

console.log(`\n${ok}/${rows.length} imported`);
