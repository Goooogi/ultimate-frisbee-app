// Frontend-only team + auth stubs for the playbook V1.
// All state lives in localStorage; will be swapped for real APIs when the
// backend lands. Shape is intentionally close to what we'd expect from the
// server (id, role, members) so migration is mostly a transport change.

import { uid } from './storage';

export interface AuthUser {
  id: string;
  name: string;
  initials: string;
}

/** Stub auth — there is no real auth yet. Once it lands this swap is a
 *  one-line change in playbook-app to read from session context. */
export const STUB_USER: AuthUser = {
  id: 'u_demo',
  name: 'You',
  initials: 'YO',
};

export type TeamRole = 'owner' | 'member' | 'invited';

export interface Team {
  id: string;
  name: string;
  /** 2-4 char display chip (e.g. "BOS", "MS"). Used in the sidebar pill. */
  shortName: string;
  /** Brand color for the team chip — pure CSS color string. */
  color: string;
  role: TeamRole;
  memberCount: number;
  /** ISO timestamps for sorting / "joined when" displays. */
  joinedAt: number;
}

interface StoredTeams {
  teams: Team[];
  currentTeamID?: string;
}

const KEY = 'the-layout.playbook.teams.v1';

function read(): StoredTeams {
  if (typeof window === 'undefined') return { teams: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { teams: [] };
    const parsed = JSON.parse(raw) as StoredTeams;
    if (!parsed || !Array.isArray(parsed.teams)) return { teams: [] };
    return parsed;
  } catch {
    return { teams: [] };
  }
}

function write(data: StoredTeams): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* QuotaExceeded → drop silently. */
  }
}

export function loadTeams(): { teams: Team[]; currentTeamID?: string } {
  return read();
}

export function saveTeams(teams: Team[], currentTeamID?: string): void {
  write({ teams, currentTeamID });
}

/** Seed used the first time a user lands in the playbook. */
export function seedTeam(): Team {
  return {
    id: uid('team'),
    name: 'My Squad',
    shortName: 'ME',
    color: '#FF3D00',
    role: 'owner',
    memberCount: 1,
    joinedAt: Date.now(),
  };
}

export function createTeam(name: string, shortName: string, color: string): Team {
  return {
    id: uid('team'),
    name: name.trim() || 'New Team',
    shortName: shortName.trim().slice(0, 4).toUpperCase() || 'NEW',
    color,
    role: 'owner',
    memberCount: 1,
    joinedAt: Date.now(),
  };
}

/** Brand palette used by the "create team" form. Same accents the rest of
 *  the app uses, so created teams feel native. */
export const TEAM_COLORS = [
  '#FF3D00', // accent orange
  '#D6FF3B', // neon
  '#3B82F6', // blue
  '#10B981', // green
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#0E0E0C', // ink
];
