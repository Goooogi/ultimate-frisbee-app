'use client';

// USAU competition-level dropdown — Club / College D-I / College D-III /
// Masters / Grand Masters. Pairs with UsauDivisionSelect in the controls
// slot of /teams?league=usau (and any future USAU pages that need both).

import { useLevel, type UsauLevel } from '@/lib/use-level';
import { levelLabel, USAU_LEVELS } from '@/lib/league';
import { PillSelect } from '@/components/pill-select';

const OPTIONS: { value: UsauLevel; label: string }[] = USAU_LEVELS.map((v) => ({
  value: v,
  label: levelLabel(v),
}));

export function UsauLevelSelect() {
  const [level, setLevel] = useLevel();
  return (
    <PillSelect
      value={level}
      onChange={setLevel}
      ariaLabel="Select competition level"
      options={OPTIONS}
    />
  );
}
