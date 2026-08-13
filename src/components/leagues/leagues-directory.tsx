// /leagues — league directory landing page body. The "home base" for the
// mobile bottom nav's Leagues tab: one card per league with its mark, full
// name, a one-line descriptor, and quick links to that league's own
// Scores/Schedule/Teams/Players (or Events/Teams/Players for the event-scoped
// hubs). Static — no DB reads, no filters. Server Component.
//
// Quick-link hrefs are copied verbatim from games-subnav.tsx's NAV_ITEMS /
// WFDF_NAV_ITEMS / EUF_NAV_ITEMS + WUL's ?league=wul routes (mobile-menu.tsx's
// WUL_NAV_ITEMS) so this page never drifts from the nav's own link set.

import Link from 'next/link';
import { LeagueMark } from '@/components/home/leagues-strip';

interface QuickLink {
  label: string;
  href: string;
}

interface LeagueCard {
  id: string;
  abbr: string;
  fullName: string;
  descriptor: string;
  img: string;
  links: QuickLink[];
}

const LEAGUES: LeagueCard[] = [
  {
    id: 'ufa',
    abbr: 'UFA',
    fullName: 'Ultimate Frisbee Association',
    descriptor: 'The pro men’s division — East, Central, South, and West.',
    img: '/UFA-red.png',
    links: [
      { label: 'Scores', href: '/scores?league=ufa' },
      { label: 'Schedule', href: '/schedule?league=ufa' },
      { label: 'Teams', href: '/teams?league=ufa' },
      { label: 'Players', href: '/players?league=ufa' },
    ],
  },
  {
    id: 'usau',
    abbr: 'USAU',
    fullName: 'USA Ultimate',
    descriptor: 'Club and college nationals across every division and level.',
    img: '/USAU-logo.png',
    links: [
      { label: 'Scores', href: '/scores?league=usau' },
      { label: 'Schedule', href: '/schedule?league=usau' },
      { label: 'Teams', href: '/teams?league=usau' },
      { label: 'Players', href: '/players?league=usau' },
    ],
  },
  {
    id: 'wul',
    abbr: 'WUL',
    fullName: 'Western Ultimate League',
    descriptor: 'The pro women’s league on the west coast.',
    img: '/WUL-logo.jpeg',
    links: [
      { label: 'Scores', href: '/scores?league=wul' },
      { label: 'Schedule', href: '/schedule?league=wul' },
      { label: 'Teams', href: '/teams?league=wul' },
      { label: 'Players', href: '/players?league=wul' },
    ],
  },
  {
    id: 'pul',
    abbr: 'PUL',
    fullName: 'Premier Ultimate League',
    descriptor: 'The pro women’s league nationwide.',
    img: '/PUL.webp',
    links: [
      { label: 'Scores', href: '/scores?league=pul' },
      { label: 'Schedule', href: '/schedule?league=pul' },
      { label: 'Teams', href: '/teams?league=pul' },
      { label: 'Players', href: '/players?league=pul' },
    ],
  },
  {
    id: 'wfdf',
    abbr: 'WFDF',
    fullName: 'World Flying Disc Federation',
    descriptor: 'World championship events — club and national teams.',
    img: '/WFDF_Logo.webp',
    links: [
      { label: 'Events', href: '/wfdf/events' },
      { label: 'Teams', href: '/wfdf/teams' },
      { label: 'Players', href: '/wfdf/players' },
    ],
  },
  {
    id: 'euf',
    abbr: 'EUF',
    fullName: 'European Ultimate Club Season',
    descriptor: 'European club championship events.',
    img: '/EUF_Logo.webp',
    links: [
      { label: 'Events', href: '/euf/events' },
      { label: 'Teams', href: '/euf/clubs' },
      { label: 'Players', href: '/euf/players' },
    ],
  },
];

export function LeaguesDirectory() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {LEAGUES.map((league) => (
        <LeagueCardTile key={league.id} league={league} />
      ))}
    </div>
  );
}

function LeagueCardTile({ league }: { league: LeagueCard }) {
  return (
    <div className="flex flex-col bg-surface rounded-card-lg shadow-card p-4">
      <div className="flex items-start gap-3">
        <LeagueMark abbr={league.abbr} img={league.img} size={44} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold font-tight leading-tight text-ink">
            {league.fullName}
          </div>
          <p className="text-[12.5px] text-muted font-tight leading-snug mt-1">
            {league.descriptor}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3.5 pt-3.5 border-t border-hairline">
        {league.links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex items-center h-8 px-3 rounded-full text-[11px] font-bold tracking-[0.06em] uppercase font-tight bg-ink/5 text-ink no-underline transition-colors duration-150 hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
