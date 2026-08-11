-- jersey_listing_events RLS only recognized LISTING-owned rows: both policies
-- check EXISTS(jersey_listings … listing_id) alone, so a WANT's event tags
-- (want_id set, listing_id null) failed every policy — posting a want with
-- "events you'll be at" errored ("You can’t edit that." = the mapped RLS
-- denial) and any want tags that did exist were invisible to readers.
-- Add the want-ownership arm to both policies, mirroring the listing rules
-- (public sees tags of active wants; only the owner writes them).

drop policy jersey_listing_events_select_public on public.jersey_listing_events;
create policy jersey_listing_events_select_public
  on public.jersey_listing_events for select
  using (
    exists (
      select 1 from jersey_listings l
      where l.id = jersey_listing_events.listing_id
        and (l.status = 'active' or l.owner_id = (select auth.uid()) or is_admin())
    )
    or exists (
      select 1 from jersey_wants w
      where w.id = jersey_listing_events.want_id
        and (w.status = 'active' or w.user_id = (select auth.uid()) or is_admin())
    )
  );

drop policy jersey_listing_events_write_owner on public.jersey_listing_events;
create policy jersey_listing_events_write_owner
  on public.jersey_listing_events for all
  using (
    exists (
      select 1 from jersey_listings l
      where l.id = jersey_listing_events.listing_id
        and (l.owner_id = (select auth.uid()) or is_admin())
    )
    or exists (
      select 1 from jersey_wants w
      where w.id = jersey_listing_events.want_id
        and (w.user_id = (select auth.uid()) or is_admin())
    )
  )
  with check (
    exists (
      select 1 from jersey_listings l
      where l.id = jersey_listing_events.listing_id
        and l.owner_id = (select auth.uid())
    )
    or exists (
      select 1 from jersey_wants w
      where w.id = jersey_listing_events.want_id
        and w.user_id = (select auth.uid())
    )
  );
