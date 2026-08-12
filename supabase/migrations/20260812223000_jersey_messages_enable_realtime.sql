-- Live thread updates. ThreadView subscribes to INSERTs on jersey_messages via
-- subscribeToThread(); without the table in the realtime publication the
-- subscription connects but never fires, so an open conversation only updated
-- on a manual refresh.
--
-- RLS still applies to realtime, so a subscriber only receives rows they could
-- already SELECT (jersey_messages_select_participant).

alter publication supabase_realtime add table public.jersey_messages;
