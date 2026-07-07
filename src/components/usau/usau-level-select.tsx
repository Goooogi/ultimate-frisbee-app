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

/**
 * `restrictTo` — when provided, only these levels are offered (kept in the
 * canonical Club → GM order). Used on the event page so a combined masters
 * championships offers just Masters / Grand Masters. Omitted → all 5.
 */
export function UsauLevelSelect({ restrictTo }: { restrictTo?: UsauLevel[] } = {}) {
  const [level, setLevel] = useLevel();
  const options =
    restrictTo && restrictTo.length > 0
      ? OPTIONS.filter((o) => restrictTo.includes(o.value))
      : OPTIONS;
  return (
    <PillSelect
      value={level}
      onChange={setLevel}
      ariaLabel="Select competition level"
      options={options}
    />
  );
}
