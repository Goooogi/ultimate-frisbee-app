
-- Add pronouns to pul_players (nullable — not all seasons have it)
ALTER TABLE public.pul_players
  ADD COLUMN IF NOT EXISTS pronouns text;

-- Add accent_color to pul_teams (nullable — populated from island _accentColor)
ALTER TABLE public.pul_teams
  ADD COLUMN IF NOT EXISTS accent_color text;

-- Notify PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';
