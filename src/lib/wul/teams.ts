// Visual metadata for every WUL franchise — static, no API.
// Colors are on-brand guesses from westernultimateleague.com; logos
// are real assets for astra/tempest/soar, colored monogram fallback
// for the other five.
//
// NOTE: logo files are WebP despite the .png extension (Squarespace
// served them that way). Browsers render them correctly via <img src>.

export interface WulTeamMeta {
  id: string;           // slug, e.g. 'astra'
  city: string;         // display city / region, e.g. 'Los Angeles'
  name: string;         // team nickname, e.g. 'Astra'
  abbr: string;         // 2-3 letter display abbreviation
  primary: string;      // hex — team primary color
  accent: string;       // hex — secondary/contrast color
  logo?: string;        // path under /public — only astra/tempest/soar
  founded?: number;     // first season year, if known
}

export const WUL_TEAMS: Record<string, WulTeamMeta> = {
  astra: {
    id: 'astra',
    city: 'Los Angeles',
    name: 'Astra',
    abbr: 'LA',
    primary: '#3BB9C4',
    accent: '#F2C200',
    logo: '/teams/wul/astra.png',
    founded: 2019,
  },
  alpenglow: {
    id: 'alpenglow',
    city: 'Colorado',
    name: 'Alpenglow',
    abbr: 'COL',
    primary: '#E0457B',   // alpine pink (mountain shield)
    accent: '#3FB6C4',    // teal sky
    logo: '/teams/wul/alpenglow.png',
  },
  falcons: {
    id: 'falcons',
    city: 'Bay Area',
    name: 'Falcons',
    abbr: 'BAY',
    primary: '#1A1A1A',   // black falcon
    accent: '#F2C200',    // gold
    logo: '/teams/wul/falcons.png',
  },
  sidewinders: {
    id: 'sidewinders',
    city: 'Arizona',
    name: 'Sidewinders',
    abbr: 'AZ',
    primary: '#F2962D',   // desert orange (AZ flag)
    accent: '#1C5C66',    // teal snake
    logo: '/teams/wul/sidewinders.png',
  },
  soar: {
    id: 'soar',
    city: 'Oregon',
    name: 'Soar',
    abbr: 'OR',
    primary: '#1C3B6E',
    accent: '#F5821F',
    logo: '/teams/wul/soar.png',
    founded: 2026,
  },
  superbloom: {
    id: 'superbloom',
    city: 'San Diego',
    name: 'Super Bloom',
    abbr: 'SD',
    primary: '#D4631F',   // poppy orange
    accent: '#1C7A6E',    // teal stems
    logo: '/teams/wul/superbloom.png',
  },
  tempest: {
    id: 'tempest',
    city: 'Seattle',
    name: 'Tempest',
    abbr: 'SEA',
    primary: '#3A5A72',
    accent: '#5DADEC',
    logo: '/teams/wul/tempest.png',
    founded: 2020,
  },
  wild: {
    id: 'wild',
    city: 'Utah',
    name: 'Wild',
    abbr: 'UT',
    primary: '#F2962D',   // desert sunset orange/yellow
    accent: '#5C2E2E',    // maroon canyon
    logo: '/teams/wul/wild.png',
  },
};

/**
 * Look up a WUL team by slug. Returns undefined for unknown slugs
 * (unlike UFA's teamMeta, WUL has no legacy franchises to cover).
 */
export function wulTeam(id: string): WulTeamMeta | undefined {
  return WUL_TEAMS[id];
}

/** All WUL teams sorted alphabetically by city. */
export function allWulTeams(): WulTeamMeta[] {
  return Object.values(WUL_TEAMS).sort((a, b) =>
    a.city.localeCompare(b.city),
  );
}
