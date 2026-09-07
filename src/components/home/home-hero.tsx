'use client';

// Home hero — the server-built league slides plus the signed-in user's STARRED
// games/tournaments in front of them. The home page is ISR (no auth at render),
// so stars resolve client-side after mount and the carousel re-keys once they
// land. Signed-out users see the server slides unchanged.
//
// DEDUPE: a starred item and the league's own pick of the same game/event
// never render two cards — server slides carry an identity key (ufa:<gameID>,
// pul:<id>, wul:<id>, usau:<slug>, wfdf:<slug>) and any key a star already
// shows is dropped from the regular run. (Mobile ports the same rule the other
// way round, skipping the regular slide at build time.)

import type { ReactNode } from 'react';
import { HeroCarousel } from '@/components/home/hero-carousel';
import { HeroGameCard } from '@/components/home/hero-game-card';
import { HeroPulSlide } from '@/components/home/hero-pul-slide';
import { HeroWulSlide } from '@/components/home/hero-wul-slide';
import { HeroUsauSlide } from '@/components/home/hero-usau-slide';
import { HeroWfdfSlide } from '@/components/home/hero-wfdf-slide';
import { HeroEufSlide } from '@/components/home/hero-euf-slide';
import { useStarredItems } from '@/lib/favorites/use-starred-items';
import { starredEventKey, starredGameKey } from '@/lib/favorites/starred-feed';

export interface KeyedSlide {
  key: string;
  node: ReactNode;
}

export function HomeHero({ slides }: { slides: KeyedSlide[] }) {
  const { items } = useStarredItems();

  const starred: KeyedSlide[] = [
    ...items.games.map((item) => {
      const key = starredGameKey(item);
      if (item.league === 'ufa') {
        return { key, node: <HeroGameCard key={key} game={item.game} eyebrow="★ Starred" /> };
      }
      if (item.league === 'pul') {
        return { key, node: <HeroPulSlide key={key} game={item.game} eyebrow="★ Starred · PUL" /> };
      }
      return { key, node: <HeroWulSlide key={key} game={item.game} eyebrow="★ Starred · WUL" /> };
    }),
    ...items.events.map((item) => {
      const key = starredEventKey(item);
      if (item.league === 'usau') {
        return { key, node: <HeroUsauSlide key={key} event={item.event} pill="★ Starred · USAU" /> };
      }
      if (item.league === 'wfdf') {
        return { key, node: <HeroWfdfSlide key={key} event={item.event} pill="★ Starred · WFDF" /> };
      }
      return { key, node: <HeroEufSlide key={key} event={item.event} pill="★ Starred · EUF" /> };
    }),
  ];

  const shown = new Set(starred.map((s) => s.key));
  const all = [...starred, ...slides.filter((s) => !shown.has(s.key))];

  // Re-key on membership change so the carousel restarts at the first slide
  // (the newest star) instead of holding a now-shifted index.
  return <HeroCarousel key={all.map((s) => s.key).join('|')} slides={all.map((s) => s.node)} />;
}
