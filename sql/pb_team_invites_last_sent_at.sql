-- pb_team_invites.last_sent_at
--
-- Tracks when an invite email was last sent (initial send OR resend). Used by
-- the resendInviteEmail server action (src/app/playbook/teams/actions.ts) to
-- enforce a per-invite resend cooldown (RESEND_COOLDOWN_MS) server-side, so one
-- address can't be spammed by repeated Resend clicks across requests/devices.
--
-- Both sendInviteEmail and resendInviteEmail stamp this column after a
-- successful Resend delivery.
--
-- Applied to The Layout (efjipdmylkqwmupvoxab) 2026-06-09.

ALTER TABLE public.pb_team_invites
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;

UPDATE public.pb_team_invites
  SET last_sent_at = created_at
  WHERE last_sent_at IS NULL;

COMMENT ON COLUMN public.pb_team_invites.last_sent_at IS
  'When the invite email was last sent (initial send or resend). Used to enforce a per-invite resend cooldown server-side.';
