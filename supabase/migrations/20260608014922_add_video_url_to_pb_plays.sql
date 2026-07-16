-- Reference video for a play (YouTube/Vimeo URL). One clip per play for v1.
-- Inherits pb_plays RLS: SELECT for owner-or-team-member, UPDATE for
-- owner-or-team-editor — so a coach can attach film a team member can view.
-- A future pb_play_videos table + Storage bucket can add multi-clip + uploads.
alter table public.pb_plays add column if not exists video_url text;