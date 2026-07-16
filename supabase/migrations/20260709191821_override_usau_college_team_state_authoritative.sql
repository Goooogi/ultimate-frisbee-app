-- The school→state map is AUTHORITATIVE for college teams (the name is the
-- school). A few college rows had a WRONG venue-derived state (e.g. British
-- Columbia/Victoria/Washington → IL from a Chicago-hosted event) that the
-- fill-nulls-only backfill skipped. Overwrite state for ANY college team whose
-- base name is in the map, regardless of current value.

WITH college_state(school, st) AS (VALUES
  ('Akron','OH'),('Alabama','AL'),('Alabama-Huntsville','AL'),('Arizona State','AZ'),
  ('Arkansas','AR'),('Auburn','AL'),('Ball State','IN'),('Baylor','TX'),
  ('Boston College','MA'),('Boston University','MA'),('Brigham Young','UT'),
  ('British Columbia','BC'),('Brown','RI'),('Cal Poly-SLO','CA'),('California','CA'),
  ('California-Davis','CA'),('California-Irvine','CA'),('California-San Diego','CA'),
  ('California-Santa Barbara','CA'),('Carnegie Mellon','PA'),('Case Western Reserve','OH'),
  ('Central Connecticut State','CT'),('Central Florida','FL'),('Chicago','IL'),
  ('Cincinnati','OH'),('Clemson','SC'),('Colorado','CO'),('Colorado State','CO'),
  ('Columbia','NY'),('Connecticut','CT'),('Cornell','NY'),('Dartmouth','NH'),
  ('Dayton','OH'),('Delaware','DE'),('Denver','CO'),('DePaul','IL'),('Duke','NC'),
  ('East Carolina','NC'),('Emory','GA'),('Florida','FL'),('Florida State','FL'),
  ('Georgia','GA'),('Georgia State','GA'),('Georgia Tech','GA'),('Gonzaga','WA'),
  ('Grand Canyon','AZ'),('Grand Valley','MI'),('Harvard','MA'),('Hofstra','NY'),
  ('Illinois','IL'),('Illinois State','IL'),('Indiana','IN'),('Iowa','IA'),
  ('Iowa State','IA'),('Jacksonville State','AL'),('Johns Hopkins','MD'),('Kansas','KS'),
  ('Kennesaw State','GA'),('Kent State','OH'),('Kentucky','KY'),('Lehigh','PA'),
  ('Liberty','VA'),('Loyola-Chicago','IL'),('LSU','LA'),('Maine','ME'),('Marquette','WI'),
  ('Maryland','MD'),('Maryland-Baltimore County','MD'),('Massachusetts','MA'),
  ('Massachusetts-Lowell','MA'),('Miami (Ohio)','OH'),('Michigan','MI'),
  ('Michigan State','MI'),('Minnesota','MN'),('Minnesota-Duluth','MN'),
  ('Mississippi State','MS'),('Missouri','MO'),('MIT','MA'),('Montana','MT'),
  ('Montana State','MT'),('Nebraska','NE'),('Nevada-Reno','NV'),('New Hampshire','NH'),
  ('North Carolina State','NC'),('North Texas','TX'),('Northeastern','MA'),
  ('Northern Iowa','IA'),('Northwestern','IL'),('Notre Dame','IN'),('NYU','NY'),
  ('Ohio','OH'),('Ohio State','OH'),('Oklahoma State','OK'),('Oregon State','OR'),
  ('Ottawa','ON'),('Penn State','PA'),('Pennsylvania','PA'),('Pittsburgh','PA'),
  ('Princeton','NJ'),('Purdue','IN'),('Rhode Island','RI'),('RIT','NY'),('Rowan','NJ'),
  ('Rutgers','NJ'),('Saint Louis','MO'),('San Diego State','CA'),('San Jose State','CA'),
  ('Santa Clara','CA'),('South Carolina','SC'),('Southern California','CA'),
  ('Southern Illinois-Edwardsville','IL'),('Stanford','CA'),('SUNY-Albany','NY'),
  ('SUNY-Binghamton','NY'),('SUNY-Buffalo','NY'),('Syracuse','NY'),('Temple','PA'),
  ('Tennessee','TN'),('Tennessee-Chattanooga','TN'),('Texas','TX'),('Texas A&M','TX'),
  ('Texas State','TX'),('Texas-Dallas','TX'),('Towson','MD'),('Tufts','MA'),
  ('Tulane','LA'),('UCLA','CA'),('Utah','UT'),('Utah State','UT'),('Utah Valley','UT'),
  ('Vanderbilt','TN'),('Vermont','VT'),('Victoria','BC'),('Villanova','PA'),
  ('Virginia Tech','VA'),('Washington','WA'),('Washington University','MO'),
  ('West Chester','PA'),('West Virginia','WV'),('Wisconsin','WI'),
  ('Wisconsin-Eau Claire','WI'),('Wisconsin-La Crosse','WI'),('Wisconsin-Milwaukee','WI'),
  ('Wisconsin-Whitewater','WI'),('Yale','CT')
)
UPDATE usau_teams t
SET state = cs.st
FROM college_state cs
WHERE t.competition_level::text LIKE 'COLLEGE%'
  AND regexp_replace(regexp_replace(t.name, '\s*\([A-C]\)\s*$', ''), '\s+', ' ', 'g') = cs.school
  AND t.state IS DISTINCT FROM cs.st;