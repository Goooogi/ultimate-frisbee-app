-- usau_scrape_runs is intentionally NOT exposed to anon/authenticated.
-- The advisor flags any RLS-enabled table without a policy as suspicious,
-- so we add an explicit "deny everything" policy that documents the intent:
-- nothing other than service-role (which bypasses RLS) can read this table.
create policy "usau_scrape_runs_deny_all"
  on public.usau_scrape_runs
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on policy "usau_scrape_runs_deny_all" on public.usau_scrape_runs is
  'Intentional deny-all. Service role bypasses RLS for writes; nobody else reads this table.';
