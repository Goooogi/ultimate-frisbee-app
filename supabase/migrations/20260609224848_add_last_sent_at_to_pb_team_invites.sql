ALTER TABLE public.pb_team_invites
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

-- Backfill existing rows so the cooldown has a sensible baseline (treat the
-- initial send as having happened at creation time).
UPDATE public.pb_team_invites
  SET last_sent_at = created_at
  WHERE last_sent_at IS NULL;

COMMENT ON COLUMN public.pb_team_invites.last_sent_at IS
  'When the invite email was last sent (initial send or resend). Used to enforce a per-invite resend cooldown server-side.';