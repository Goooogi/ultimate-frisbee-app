// Static design tokens for teams. The dynamic team data layer lives in
// ./data.ts — this file only owns the color palette and re-exports the
// `Team` / `TeamRole` types from there for backwards compatibility with
// components that still pull them from the old path.

export type { Team, TeamRole } from './data';

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
