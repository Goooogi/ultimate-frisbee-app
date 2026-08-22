-- Playbook: lines, per-play personnel, and play tags.
--
-- Builds on pb_roster_players (20260821210000). Three independent additions
-- that share the same member-read / editor-write RLS shape as the rest of the
-- playbook:
--
--   1. pb_lines + pb_line_players — named units (O-line, D-line, zone) drawn
--      from the roster. Flexible size, NOT fixed at 7: coaches keep 8-9 per
--      unit and sub, so a hard 7-cap would fight real usage. A benched player
--      stays on their line (grayed out in the UI) rather than being silently
--      dropped — removing them is a coach's decision, not a side effect.
--
--   2. pb_play_personnel — maps a roster player onto a chip slot (0..6) of a
--      play. Per PLAY, not per step: same seven for every step of the play,
--      which covers the overwhelming majority of real use and keeps the step
--      payload untouched. Chip labels are derived at render time, so existing
--      plays and their stored steps are completely unaffected.
--
--   3. pb_plays.tags — situational tags for filtering (o-line, endzone,
--      zone-offense, after-timeout, …). A text[] on the play rather than a
--      join table: the vocabulary is small, closed, and app-defined, and every
--      read wants the tags inline with the play we're already selecting.

-- ── 1. lines ───────────────────────────────────────────────────────────────

CREATE TABLE pb_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES pb_teams(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (btrim(name) <> '' AND length(name) <= 60),
  -- Broad unit kind, used for grouping + sensible defaults in the UI.
  kind        text NOT NULL DEFAULT 'other' CHECK (kind IN ('offense', 'defense', 'special', 'other')),
  note        text CHECK (note IS NULL OR length(note) <= 280),
  sort_order  integer NOT NULL DEFAULT 0,
  created_by  uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pb_lines_team_idx ON pb_lines (team_id, sort_order, created_at);

-- Line names are unique per team so "O-line" can't exist twice ambiguously.
CREATE UNIQUE INDEX pb_lines_team_name_key ON pb_lines (team_id, lower(btrim(name)));

CREATE TABLE pb_line_players (
  line_id     uuid NOT NULL REFERENCES pb_lines(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES pb_roster_players(id) ON DELETE CASCADE,
  sort_order  integer NOT NULL DEFAULT 0,
  PRIMARY KEY (line_id, player_id)
);

CREATE INDEX pb_line_players_line_idx ON pb_line_players (line_id, sort_order);
CREATE INDEX pb_line_players_player_idx ON pb_line_players (player_id);

-- ── 2. per-play personnel ──────────────────────────────────────────────────

CREATE TABLE pb_play_personnel (
  play_id     uuid NOT NULL REFERENCES pb_plays(id) ON DELETE CASCADE,
  -- Chip slot on the field. PLAYER_COUNT is 7, so 0..6.
  slot        smallint NOT NULL CHECK (slot BETWEEN 0 AND 6),
  player_id   uuid NOT NULL REFERENCES pb_roster_players(id) ON DELETE CASCADE,
  PRIMARY KEY (play_id, slot)
);

-- One athlete can't occupy two chips in the same play.
CREATE UNIQUE INDEX pb_play_personnel_play_player_key
  ON pb_play_personnel (play_id, player_id);

CREATE INDEX pb_play_personnel_player_idx ON pb_play_personnel (player_id);

-- ── 3. play tags ───────────────────────────────────────────────────────────

-- Empty array (not null) is the "untagged" state, so readers never branch.
-- Cap the count and each tag's length so a client can't stuff the column.
-- CHECK constraints can't contain subqueries, so the per-element rules go in
-- an IMMUTABLE helper the constraint calls.
CREATE OR REPLACE FUNCTION pb_tags_valid(tags text[])
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT tags IS NULL
      OR array_length(tags, 1) IS NULL
      OR (
        array_length(tags, 1) <= 12
        -- no duplicates
        AND array_length(tags, 1) = (SELECT count(DISTINCT t) FROM unnest(tags) t)
        -- no blank / overlong entries
        AND NOT EXISTS (
          SELECT 1 FROM unnest(tags) t WHERE btrim(t) = '' OR length(t) > 40
        )
      );
$$;

ALTER TABLE pb_plays
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}'
  CHECK (pb_tags_valid(tags));

-- GIN index so `tags @> '{endzone}'` filtering stays cheap as playbooks grow.
CREATE INDEX pb_plays_tags_idx ON pb_plays USING gin (tags);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Same predicate pair the rest of the playbook uses: members read, editors
-- (owner/coach) write.

ALTER TABLE pb_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY pb_lines_select_member ON pb_lines
  FOR SELECT USING (is_team_member(team_id));

CREATE POLICY pb_lines_insert_editor ON pb_lines
  FOR INSERT WITH CHECK (is_team_editor(team_id) AND created_by = (SELECT auth.uid()));

CREATE POLICY pb_lines_update_editor ON pb_lines
  FOR UPDATE USING (is_team_editor(team_id)) WITH CHECK (is_team_editor(team_id));

CREATE POLICY pb_lines_delete_editor ON pb_lines
  FOR DELETE USING (is_team_editor(team_id));

-- pb_line_players carries no team_id of its own; every policy resolves the
-- owning team through the parent line. EXISTS (not a join) so the planner can
-- use the pb_lines PK directly.
ALTER TABLE pb_line_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY pb_line_players_select_member ON pb_line_players
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pb_lines l WHERE l.id = line_id AND is_team_member(l.team_id))
  );

-- Write policies additionally verify the roster player belongs to the SAME
-- team as the line. Without that check an editor of team A could attach a
-- player row from team B (they'd need B's player id, but ids leak easily and
-- a cross-team write would corrupt B's roster associations).
CREATE POLICY pb_line_players_insert_editor ON pb_line_players
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pb_lines l
      JOIN pb_roster_players rp ON rp.id = player_id
      WHERE l.id = line_id
        AND is_team_editor(l.team_id)
        AND rp.team_id = l.team_id
    )
  );

CREATE POLICY pb_line_players_update_editor ON pb_line_players
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM pb_lines l WHERE l.id = line_id AND is_team_editor(l.team_id))
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM pb_lines l
      JOIN pb_roster_players rp ON rp.id = player_id
      WHERE l.id = line_id
        AND is_team_editor(l.team_id)
        AND rp.team_id = l.team_id
    )
  );

CREATE POLICY pb_line_players_delete_editor ON pb_line_players
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM pb_lines l WHERE l.id = line_id AND is_team_editor(l.team_id))
  );

-- pb_play_personnel resolves through the parent play. A play is either
-- personal (owner_id = me, team_id null) or a team play. Personnel only makes
-- sense for TEAM plays — a personal play has no roster to draw from — so the
-- policies require the play to have a team and the caller to be a member /
-- editor of it.
ALTER TABLE pb_play_personnel ENABLE ROW LEVEL SECURITY;

CREATE POLICY pb_play_personnel_select_member ON pb_play_personnel
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pb_plays p
      WHERE p.id = play_id AND p.team_id IS NOT NULL AND is_team_member(p.team_id)
    )
  );

CREATE POLICY pb_play_personnel_insert_editor ON pb_play_personnel
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pb_plays p
      JOIN pb_roster_players rp ON rp.id = player_id
      WHERE p.id = play_id
        AND p.team_id IS NOT NULL
        AND is_team_editor(p.team_id)
        AND rp.team_id = p.team_id
    )
  );

CREATE POLICY pb_play_personnel_update_editor ON pb_play_personnel
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM pb_plays p
      WHERE p.id = play_id AND p.team_id IS NOT NULL AND is_team_editor(p.team_id)
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM pb_plays p
      JOIN pb_roster_players rp ON rp.id = player_id
      WHERE p.id = play_id
        AND p.team_id IS NOT NULL
        AND is_team_editor(p.team_id)
        AND rp.team_id = p.team_id
    )
  );

CREATE POLICY pb_play_personnel_delete_editor ON pb_play_personnel
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM pb_plays p
      WHERE p.id = play_id AND p.team_id IS NOT NULL AND is_team_editor(p.team_id)
    )
  );

-- ── updated_at maintenance ─────────────────────────────────────────────────

CREATE TRIGGER pb_lines_touch_trg
  BEFORE UPDATE ON pb_lines
  FOR EACH ROW EXECUTE FUNCTION pb_roster_players_touch();

NOTIFY pgrst, 'reload schema';
