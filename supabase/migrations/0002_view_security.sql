-- ============================================================================
-- JC CRM -- migration 0002: close the reporting-view leak
--
-- SAFE TO RUN: no data is touched. This only changes who is allowed to read
-- two views. No DROP TABLE, no DELETE, no column changes.
--
-- The problem it fixes:
--   A Postgres view executes with the privileges of the view's OWNER, not the
--   caller. Both reporting views are owned by postgres, so they bypassed row
--   level security on leads and app_users entirely -- returning staff names,
--   win counts and loss counts to anyone holding the anon key. That key is
--   public by design: it is compiled into the browser bundle.
--
--   security_invoker = true makes the view run as the CALLING user instead, so
--   the same RLS that protects the tables now protects the views.
-- ============================================================================

alter view public.v_leaderboard set (security_invoker = true);
alter view public.v_win_rate   set (security_invoker = true);

-- Belt and braces: signed-out visitors have no business reading either view,
-- even with security_invoker on.
revoke all on public.v_leaderboard from anon;
revoke all on public.v_win_rate   from anon;

grant select on public.v_leaderboard to authenticated;
grant select on public.v_win_rate   to authenticated;


-- ----------------------------------------------------------------------------
-- Admin-only loss reporting.
--
-- Kept as a separate view so the leaderboard never has to carry loss columns
-- it might accidentally render. is_admin() is checked inside the view, so a
-- member selecting from it gets nothing back rather than an error.
-- ----------------------------------------------------------------------------

create or replace view public.v_losses as
select
  l.id,
  l.name,
  l.category_id,
  c.name              as category,
  l.annual_value,
  l.lost_reason,
  l.lost_note,
  l.closed_at,
  u.display_name      as owner
from public.leads l
join public.categories c on c.id = l.category_id
left join public.app_users u on u.id = l.owner_id
where l.stage = 'lost'
  and public.is_admin();

alter view public.v_losses set (security_invoker = true);
revoke all on public.v_losses from anon;
grant select on public.v_losses to authenticated;


-- ----------------------------------------------------------------------------
-- Per-person win rate. Admin only, for the same reason: a rate published per
-- person publishes that person's losses by arithmetic.
-- ----------------------------------------------------------------------------

create or replace view public.v_person_win_rate as
select
  u.display_name,
  count(*) filter (where l.stage = 'won')  as won,
  count(*) filter (where l.stage = 'lost') as lost,
  case when count(*) filter (where l.stage in ('won','lost')) = 0 then null
       else round(100.0 * count(*) filter (where l.stage = 'won')
                  / count(*) filter (where l.stage in ('won','lost'))) end as win_pct
from public.app_users u
left join public.leads l on l.owner_id = u.id
where u.active and public.is_admin()
group by u.display_name;

alter view public.v_person_win_rate set (security_invoker = true);
revoke all on public.v_person_win_rate from anon;
grant select on public.v_person_win_rate to authenticated;
