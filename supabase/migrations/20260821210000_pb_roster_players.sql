-- Playbook rosters. A roster player is an ATHLETE on the team, deliberately
-- decoupled from an app login: a coach must be able to enter all 25 players
-- immediately without waiting for anyone to sign up. `user_id` optionally links
-- a roster entry to a pb_team_members user once that person joins.
--
-- Separate from pb_team_members, which stays what it is: who can SEE and EDIT
-- the playbook (permissions), not who plays.
--
-- Lines and per-play role assignment build on this table in a later pass.

CREATE TABLE pb_roster_players (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES pb_teams(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 80),
  -- Jersey number: text, not int. Real jerseys include '00', '0', and leading
  -- zeros that an integer column would silently collapse.
  number      text CHECK (number IS NULL OR (btrim(number) <> '' AND length(number) <= 4)),
  position    text NOT NULL DEFAULT 'hybrid' CHECK (position IN ('handler', 'cutter', 'hybrid')),
  -- Optional link to the app user, set when the athlete also has a login.
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Soft bench: inactive players stay for history but drop out of line pickers.
  active      boolean NOT NULL DEFAULT true,
  note        text CHECK (note IS NULL OR length(note) <= 280),
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pb_roster_players_team_idx ON pb_roster_players (team_id, sort_order, created_at);

-- One roster entry per linked user per team (a person can't be on the same
-- roster twice). Partial: unlinked entries are unconstrained, since two real
-- players may legitimately share a name.
CREATE UNIQUE INDEX pb_roster_players_team_user_key
  ON pb_roster_players (team_id, user_id) WHERE user_id IS NOT NULL;

-- Jersey numbers are unique among ACTIVE players on a team. Inactive players
-- keep their number for history without blocking reuse.
CREATE UNIQUE INDEX pb_roster_players_team_number_key
  ON pb_roster_players (team_id, number) WHERE number IS NOT NULL AND active;

ALTER TABLE pb_roster_players ENABLE ROW LEVEL SECURITY;

-- Same predicate pair the rest of the playbook uses: members read, editors
-- (owner/coach) write. is_team_member / is_team_editor already exist.
CREATE POLICY pb_roster_players_select_member ON pb_roster_players
  FOR SELECT USING (is_team_member(team_id));

CREATE POLICY pb_roster_players_insert_editor ON pb_roster_players
  FOR INSERT WITH CHECK (is_team_editor(team_id) AND created_by = (SELECT auth.uid()));

CREATE POLICY pb_roster_players_update_editor ON pb_roster_players
  FOR UPDATE USING (is_team_editor(team_id)) WITH CHECK (is_team_editor(team_id));

CREATE POLICY pb_roster_players_delete_editor ON pb_roster_players
  FOR DELETE USING (is_team_editor(team_id));

-- updated_at maintenance, matching the trigger pattern used by pb_plays.
CREATE OR REPLACE FUNCTION pb_roster_players_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER pb_roster_players_touch_trg
  BEFORE UPDATE ON pb_roster_players
  FOR EACH ROW EXECUTE FUNCTION pb_roster_players_touch();

NOTIFY pgrst, 'reload schema';
