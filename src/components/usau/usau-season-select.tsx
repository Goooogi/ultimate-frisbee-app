'use client';

// USAU season picker, bound to ?season=YYYY. Lives in the schedule's header
// controls row (so on mobile it sits ABOVE the level/division/flight filters,
// its own line) and persists/shares via the URL. Absent ?season ⇒ latest.

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PillSelect } from '@/components/pill-select';
import { listSeasons } from '@/lib/usau/data';

export function UsauSeasonSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [seasons, setSeasons] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    listSeasons()
      .then((s) => !cancelled && setSeasons(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (seasons.length === 0) return null;

  const paramSeason = Number(searchParams.get('season'));
  const current = seasons.includes(paramSeason) ? paramSeason : seasons[0];

  const onChange = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    // Latest season is the default → keep the URL clean by omitting it.
    if (next === seasons[0]) params.delete('season');
    else params.set('season', String(next));
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  return (
    <PillSelect
      value={current}
      onChange={onChange}
      ariaLabel="Select season"
      options={seasons.map((y) => ({ value: y, label: `${y} Season` }))}
    />
  );
}
