-- UFA is the one league that publishes player headshots (on watchufa.com player
-- profile pages: <img src=".../profile-images/{playerID}_profile.{ext}">). We
-- hotlink the public CDN URL rather than re-host. ~90% of players have one; the
-- rest stay null (UI falls back to the existing team monogram/logo).
alter table ufa_players add column if not exists headshot_url text;