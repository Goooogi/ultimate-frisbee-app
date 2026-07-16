
-- Enable pg_cron + pg_net for scheduled HTTP triggers.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
