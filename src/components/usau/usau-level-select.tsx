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
 *
 * `value` — display override. The event detail page resolves an EFFECTIVE level
 * (falls back to the first available level when the URL has no `?level=`, since
 * a combined masters championships has no Club teams). Without this the pill
 * would read the raw URL level ('CLUB' by default), which isn't in `restrictTo`
 * for such an event → PillSelect renders a blank label (empty bubble). Passing
 * the resolved value keeps the pill in sync with what the page actually shows.
 */
export function UsauLevelSelect({
  restrictTo,
  value,
}: { restrictTo?: UsauLevel[]; value?: UsauLevel } = {}) {
  const [urlLevel, setLevel] = useLevel();
  const options =
    restrictTo && restrictTo.length > 0
      ? OPTIONS.filter((o) => restrictTo.includes(o.value))
      : OPTIONS;
  // Prefer the explicit resolved value; otherwise fall back to the URL level,
  // and finally to the first offered option so the trigger is never blank.
  const displayValue = value ?? urlLevel;
  const safeValue = options.some((o) => o.value === displayValue)
    ? displayValue
    : options[0]?.value ?? displayValue;
  return (
    <PillSelect
      value={safeValue}
      onChange={setLevel}
      ariaLabel="Select competition level"
      options={options}
    />
  );
}
