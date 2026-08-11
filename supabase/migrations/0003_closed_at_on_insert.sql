-- ============================================================================
-- JC CRM -- migration 0003: stamp closed_at when a lead is INSERTED as closed
--
-- SAFE TO RUN: no data removed. Adds one trigger and backfills a timestamp on
-- rows that are already marked won/lost but have no closed_at.
--
-- The bug: leads_before_update() stamps closed_at when the stage CHANGES to
-- won or lost. A lead created already-closed -- which is what a history import
-- does, and what marking an old job as lost on entry does -- skipped it, so
-- closed_at stayed null. Anything reporting by close date silently missed them.
-- ============================================================================

create or replace function public.leads_before_insert() returns trigger
language plpgsql as $$
begin
  if new.stage in ('won','lost') and new.closed_at is null then
    -- Fall back to created_at, not now(): an imported job closed in July should
    -- not report as closing the day it was typed in.
    new.closed_at := coalesce(new.created_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists leads_before_insert_t on public.leads;
create trigger leads_before_insert_t before insert on public.leads
  for each row execute function public.leads_before_insert();


-- Backfill the rows already in the table. created_at holds the date the quote
-- went out, which is the closest honest anchor available -- the ledger records
-- the month these were notified but not the day.
update public.leads
   set closed_at = created_at
 where stage in ('won','lost')
   and closed_at is null;
