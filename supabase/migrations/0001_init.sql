-- ============================================================================
-- JC CRM -- initial schema
-- Run once in Supabase > SQL Editor. Safe to re-run: everything is IF NOT EXISTS
-- or CREATE OR REPLACE.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. People
--    app_users is the allowlist AND the staff list. No row here, no access --
--    that is the whole authorisation model.
-- ----------------------------------------------------------------------------

create table if not exists public.app_users (
  id               uuid primary key default gen_random_uuid(),
  email            text unique not null,
  display_name     text not null,
  role             text not null default 'member' check (role in ('member','admin')),
  telegram_user_id bigint,               -- captured from group join events
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

alter table public.app_users enable row level security;

comment on column public.app_users.telegram_user_id is
  'Set automatically when the person is added to the Telegram group. Needed to @mention them in a nudge.';


-- ----------------------------------------------------------------------------
-- 2. Categories
--    Every rule that differs by job type lives here, as data -- cadence,
--    win-rate target, whether it shows a % or a tally. Changing how builders
--    cleans behave is an UPDATE, not a deploy.
-- ----------------------------------------------------------------------------

create table if not exists public.categories (
  id                  text primary key,
  name                text not null,
  win_group           text not null check (win_group in ('tendered','inbound')),
  default_billing     text not null check (default_billing in ('oneoff','recurring','periodical')),
  entry_shape         text not null check (entry_shape in ('project','direct')),

  -- cadence in days, by stage. NULL = this stage is date-driven, not chased.
  cadence_new         int,
  cadence_contacted   int,
  cadence_quoted      int,
  cadence_followup    int,

  win_target_pct      int,               -- NULL = never show a %, always tally
  sort_order          int not null default 0
);

alter table public.categories enable row level security;

insert into public.categories
  (id, name, win_group, default_billing, entry_shape,
   cadence_new, cadence_contacted, cadence_quoted, cadence_followup, win_target_pct, sort_order)
values
  ('builders',  'Builders clean',    'tendered','oneoff',    'project', 1, 2, 30, 30, 35, 1),
  ('private',   'Private tender',    'tendered','recurring', 'project', 1, 3, 30, 30, 25, 2),
  -- government: once lodged it runs on the decision date, so quoted/followup are NULL.
  -- win_target_pct NULL because ~1 SA opportunity a month can't support a percentage.
  ('govt',      'Government tender', 'tendered','recurring', 'project', 1, 3, null, null, null, 3),
  ('daily',     'Daily contract',    'inbound', 'recurring', 'direct',  1, 3, 4, 5, 60, 4),
  ('periodical','Periodical',        'inbound', 'periodical','direct',  1, 3, 4, 5, 65, 5),
  ('oneoff',    'One-off',           'inbound', 'oneoff',    'direct',  1, 2, 3, 4, 60, 6)
on conflict (id) do nothing;


-- ----------------------------------------------------------------------------
-- 3. Settings -- the handful of numbers you'll want to tune without a deploy
-- ----------------------------------------------------------------------------

create table if not exists public.settings (
  key   text primary key,
  value numeric not null,
  note  text
);

alter table public.settings enable row level security;

insert into public.settings (key, value, note) values
  ('monthly_target',        180000, 'Team target, annualised won value'),
  ('brake_after_touches',   5,      'Touches with no response before cadence drops to monthly'),
  ('brake_cadence_days',    30,     'Cadence once braked'),
  ('escalate_after_nudges', 3,      'Unanswered nudges before it escalates to admin'),
  ('tally_threshold',       8,      'Closed jobs in 12mo below which a category shows a tally, not a %'),
  ('pc_alert_days',         21,     'First practical-completion nudge, days before PC'),
  ('pc_alert_days_2',       7,      'Second practical-completion nudge'),
  ('push_out_max_days',     14,     'Longest a nudge can be pushed out, with a reason')
on conflict (key) do nothing;


-- ----------------------------------------------------------------------------
-- 4. Leads -- the one object.
--    A lead is a JOB, not an invitation. Several builders quoting the same
--    scope is one row here plus rows in lead_builders.
-- ----------------------------------------------------------------------------

create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),

  name            text not null,          -- project name, or company for direct work
  site_address    text,
  postal_address  text,

  -- direct-work contact. For projects the contacts live on lead_builders.
  contact_name    text,
  contact_phone   text,
  contact_email   text,

  category_id     text not null references public.categories(id),
  source          text,

  -- value. Enter the rate + frequency; annual_value is derived, never typed.
  billing         text not null check (billing in ('oneoff','recurring','periodical')),
  value_amount    numeric(12,2) not null default 0,
  value_freq      int not null default 1,   -- 52 wk / 26 fortnight / 12 mo, or visits per year
  annual_value    numeric(12,2)
                    generated always as (
                      case when billing = 'oneoff' then value_amount
                           else value_amount * value_freq end
                    ) stored,

  owner_id        uuid references public.app_users(id),

  stage           text not null default 'new'
                    check (stage in ('new','contacted','quoted','followup','won','lost')),

  -- dates that outrank the cadence
  closes_at       timestamptz,   -- tender/quote deadline. Missing this is unrecoverable.
  pc_date         date,          -- practical completion -- the builder's real trigger
  decision_due    date,          -- set with awaiting_outcome

  awaiting_outcome boolean not null default false,

  -- follow-up engine state
  next_nudge_at   timestamptz,
  nudge_streak    int not null default 0,   -- consecutive nudges with no touchpoint
  braked          boolean not null default false,
  push_out_reason text,

  -- outcome
  won_builder_id  uuid,
  lost_reason     text check (lost_reason in ('price','timing','no_response','went_internal','other')),
  lost_note       text,
  closed_at       timestamptz,

  created_by      uuid references public.app_users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- a lodged tender must carry the date that replaces its cadence
  constraint awaiting_needs_date check (not awaiting_outcome or decision_due is not null),
  -- a loss must say why
  constraint lost_needs_reason   check (stage <> 'lost' or lost_reason is not null)
);

alter table public.leads enable row level security;

create index if not exists leads_stage_idx     on public.leads (stage);
create index if not exists leads_owner_idx     on public.leads (owner_id);
create index if not exists leads_nudge_idx     on public.leads (next_nudge_at)
  where stage not in ('won','lost');
create index if not exists leads_closes_idx    on public.leads (closes_at)
  where stage not in ('won','lost');
create index if not exists leads_pc_idx        on public.leads (pc_date)
  where stage not in ('won','lost');
-- duplicate protection: stops two people logging the same site as separate jobs
create unique index if not exists leads_open_site_idx
  on public.leads (lower(site_address))
  where stage not in ('won','lost') and site_address is not null;


-- ----------------------------------------------------------------------------
-- 5. Builders quoting a project
--    Chasing is per builder -- each carries its own touch count and last contact,
--    so "touch 3" can't mean you rang one builder three times and never called
--    the other two.
-- ----------------------------------------------------------------------------

create table if not exists public.lead_builders (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads(id) on delete cascade,
  name          text not null,
  contact_name  text,
  contact_email text,
  contact_phone text,
  touch_count   int not null default 0,
  last_touch_at timestamptz,
  outcome       text check (outcome in ('awarded','not_awarded')),
  created_at    timestamptz not null default now()
);

alter table public.lead_builders enable row level security;

create index if not exists lead_builders_lead_idx on public.lead_builders (lead_id);

comment on column public.lead_builders.outcome is
  'awarded = this builder won it. not_awarded is NOT a loss and never counts against win rate.';

alter table public.leads
  drop constraint if exists leads_won_builder_fk;
alter table public.leads
  add constraint leads_won_builder_fk
  foreign key (won_builder_id) references public.lead_builders(id) on delete set null;


-- ----------------------------------------------------------------------------
-- 6. Touchpoints -- the only thing that resets the nudge clock
-- ----------------------------------------------------------------------------

create table if not exists public.touchpoints (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads(id) on delete cascade,
  builder_id uuid references public.lead_builders(id) on delete set null,
  user_id    uuid references public.app_users(id),
  kind       text not null default 'call' check (kind in ('call','email','visit','quote','other')),
  note       text,
  created_at timestamptz not null default now()
);

alter table public.touchpoints enable row level security;

create index if not exists touchpoints_lead_idx on public.touchpoints (lead_id, created_at desc);


-- ----------------------------------------------------------------------------
-- 7. Inbound queue -- Gmail capture lands here, unassigned
-- ----------------------------------------------------------------------------

create table if not exists public.inbox_queue (
  id              uuid primary key default gen_random_uuid(),
  gmail_thread_id text unique,
  subject         text,
  from_email      text,
  snippet         text,
  received_at     timestamptz not null default now(),
  claimed_by      uuid references public.app_users(id),
  claimed_at      timestamptz,
  lead_id         uuid references public.leads(id) on delete set null,
  dismissed       boolean not null default false
);

alter table public.inbox_queue enable row level security;

create index if not exists inbox_open_idx on public.inbox_queue (received_at desc)
  where claimed_by is null and not dismissed;


-- ----------------------------------------------------------------------------
-- 8. Channel spend -- feeds cost per lead and cost per click
-- ----------------------------------------------------------------------------

create table if not exists public.channel_spend (
  id      uuid primary key default gen_random_uuid(),
  month   date not null,             -- first of the month
  channel text not null,             -- 'Google Ads', 'Meta', ...
  spend   numeric(12,2) not null default 0,
  clicks  int not null default 0,
  source  text not null default 'manual' check (source in ('manual','api')),
  unique (month, channel)
);

alter table public.channel_spend enable row level security;


-- ----------------------------------------------------------------------------
-- 9. Nudge log -- what was sent, so nothing fires twice
-- ----------------------------------------------------------------------------

create table if not exists public.nudge_log (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid references public.leads(id) on delete cascade,
  kind       text not null check (kind in ('cadence','close','pc','escalation','digest','review')),
  detail     text,
  sent_at    timestamptz not null default now()
);

alter table public.nudge_log enable row level security;

create index if not exists nudge_log_lead_idx on public.nudge_log (lead_id, kind, sent_at desc);


-- ============================================================================
-- Follow-up engine -- cadence lives in the database, not in app code, so the
-- clock is correct even if a lead is changed by a script or by hand.
-- ============================================================================

create or replace function public.cadence_days(p_category text, p_stage text, p_braked boolean)
returns int language sql stable as $$
  select case
    when p_braked then (select value::int from public.settings where key = 'brake_cadence_days')
    when p_stage = 'new'       then c.cadence_new
    when p_stage = 'contacted' then c.cadence_contacted
    when p_stage = 'quoted'    then c.cadence_quoted
    when p_stage = 'followup'  then c.cadence_followup
    else null
  end
  from public.categories c where c.id = p_category;
$$;

-- Recalculate next_nudge_at. Called on insert, on stage change, and after a touch.
create or replace function public.reset_nudge(p_lead uuid, p_from timestamptz default now())
returns void language plpgsql as $$
declare
  l public.leads%rowtype;
  d int;
begin
  select * into l from public.leads where id = p_lead;
  if not found then return; end if;

  -- closed, or a lodged tender waiting on a decision: no cadence
  if l.stage in ('won','lost') then
    update public.leads set next_nudge_at = null where id = p_lead;
    return;
  end if;

  if l.awaiting_outcome then
    update public.leads
       set next_nudge_at = l.decision_due::timestamptz
     where id = p_lead;
    return;
  end if;

  d := public.cadence_days(l.category_id, l.stage, l.braked);

  update public.leads
     set next_nudge_at = case when d is null then null else p_from + make_interval(days => d) end
   where id = p_lead;
end;
$$;

-- New lead: start the clock.
create or replace function public.leads_after_insert() returns trigger
language plpgsql as $$
begin
  perform public.reset_nudge(new.id, new.created_at);
  return new;
end;
$$;

drop trigger if exists leads_after_insert_t on public.leads;
create trigger leads_after_insert_t after insert on public.leads
  for each row execute function public.leads_after_insert();

-- Stage change: new stage, new cadence. Closing stamps closed_at.
create or replace function public.leads_before_update() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();

  if new.stage is distinct from old.stage then
    new.nudge_streak := 0;
    new.braked := false;
    if new.stage in ('won','lost') and new.closed_at is null then
      new.closed_at := now();
    end if;
    if new.stage not in ('won','lost') then
      new.closed_at := null;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists leads_before_update_t on public.leads;
create trigger leads_before_update_t before update on public.leads
  for each row execute function public.leads_before_update();

create or replace function public.leads_after_update() returns trigger
language plpgsql as $$
begin
  if new.stage is distinct from old.stage
     or new.awaiting_outcome is distinct from old.awaiting_outcome
     or new.braked is distinct from old.braked then
    perform public.reset_nudge(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists leads_after_update_t on public.leads;
create trigger leads_after_update_t after update on public.leads
  for each row execute function public.leads_after_update();

-- A touchpoint is the ONLY thing that resets the clock. It also rolls the
-- builder's own counters, and applies the brake once someone has tried enough
-- times with no answer.
create or replace function public.touchpoints_after_insert() returns trigger
language plpgsql as $$
declare
  total int;
  brake_at int;
begin
  if new.builder_id is not null then
    update public.lead_builders
       set touch_count = touch_count + 1,
           last_touch_at = new.created_at
     where id = new.builder_id;
  end if;

  select count(*) into total from public.touchpoints where lead_id = new.lead_id;
  select value::int into brake_at from public.settings where key = 'brake_after_touches';

  update public.leads
     set nudge_streak = 0,
         braked = (total >= brake_at)
   where id = new.lead_id;

  perform public.reset_nudge(new.lead_id, new.created_at);
  return new;
end;
$$;

drop trigger if exists touchpoints_after_insert_t on public.touchpoints;
create trigger touchpoints_after_insert_t after insert on public.touchpoints
  for each row execute function public.touchpoints_after_insert();


-- ============================================================================
-- Reporting views
-- ============================================================================

-- Leaderboard: wins only. Losses are deliberately absent from this view so a
-- UI bug can't leak them onto the board.
create or replace view public.v_leaderboard as
select
  u.id                                    as user_id,
  u.display_name,
  count(*) filter (where l.closed_at >= now() - interval '30 days')          as wins_30d,
  coalesce(sum(l.annual_value) filter (where l.closed_at >= now() - interval '30 days'), 0) as value_30d,
  count(*) filter (where l.closed_at >= date_trunc('year', now() - interval '6 months') + interval '6 months') as wins_fy,
  coalesce(sum(l.annual_value) filter (where l.closed_at >= date_trunc('year', now() - interval '6 months') + interval '6 months'), 0) as value_fy
from public.app_users u
left join public.leads l
  on l.owner_id = u.id and l.stage = 'won'
where u.active
group by u.id, u.display_name;

-- Win rate by category. Returns counts as well as the rate, so the UI can
-- decide to render a tally instead of a percentage when the sample is thin.
create or replace view public.v_win_rate as
select
  c.id            as category_id,
  c.name,
  c.win_group,
  c.win_target_pct,
  count(*) filter (where l.stage = 'won')                                 as won,
  count(*) filter (where l.stage = 'lost')                                as lost,
  count(*) filter (where l.stage not in ('won','lost'))                   as open,
  count(*) filter (where l.stage in ('won','lost'))                       as closed,
  case when count(*) filter (where l.stage in ('won','lost')) = 0 then null
       else round(
         100.0 * count(*) filter (where l.stage = 'won')
         / count(*) filter (where l.stage in ('won','lost'))
       ) end                                                              as win_pct,
  (count(*) filter (where l.stage in ('won','lost'))
     < (select value::int from public.settings where key = 'tally_threshold'))
   or c.win_target_pct is null                                            as show_as_tally
from public.categories c
left join public.leads l
  on l.category_id = c.id
 and (l.closed_at is null or l.closed_at >= now() - interval '12 months')
group by c.id, c.name, c.win_group, c.win_target_pct, c.sort_order
order by c.sort_order;


-- ============================================================================
-- Row level security -- policies
--   RLS was switched on at each table above, so no table ever exists
--   unprotected even if this script fails partway. What follows is the
--   policies: nothing is readable without a row in app_users. is_active_user()
--   is SECURITY DEFINER so the check itself doesn't re-trigger RLS.
-- ============================================================================

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
     where lower(email) = lower(auth.jwt() ->> 'email') and active
  );
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.app_users
     where lower(email) = lower(auth.jwt() ->> 'email') and active and role = 'admin'
  );
$$;

do $$
declare t text;
begin
  -- staff read everything and write the working tables
  foreach t in array array['leads','lead_builders','touchpoints','inbox_queue','nudge_log'] loop
    execute format('drop policy if exists staff_all on public.%I', t);
    execute format(
      'create policy staff_all on public.%I for all
         using (public.is_active_user()) with check (public.is_active_user())', t);
  end loop;

  -- reference data: everyone reads, admin writes
  foreach t in array array['categories','settings','channel_spend'] loop
    execute format('drop policy if exists staff_read on public.%I', t);
    execute format('create policy staff_read on public.%I for select using (public.is_active_user())', t);
    execute format('drop policy if exists admin_write on public.%I', t);
    execute format(
      'create policy admin_write on public.%I for all
         using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

drop policy if exists users_read on public.app_users;
create policy users_read on public.app_users
  for select using (public.is_active_user());

drop policy if exists users_admin on public.app_users;
create policy users_admin on public.app_users
  for all using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- Seed: the first user. Without this row nobody can log in -- including you.
-- ============================================================================

insert into public.app_users (email, display_name, role)
values ('jordan@jccommercial.com.au', 'Jordan', 'admin')
on conflict (email) do update set role = 'admin', active = true;
