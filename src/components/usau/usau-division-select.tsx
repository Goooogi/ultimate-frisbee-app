'use client';

// USAU division dropdown — Men / Women / Mixed. Used as a `controls`
// slot on USAU pages (Schedule, Teams, Players) and inline on the
// /scores USAU view. Renders via the shared PillSelect primitive so
// the popover matches the rest of the chrome.

import { useDivision, type UsauDivision } from '@/lib/use-division';
import { PillSelect } from '@/components/pill-select';

const OPTIONS: { value: UsauDivision; label: string }[] = [
  { value: 'Men', label: 'Men' },
  { value: 'Women', label: 'Women' },
  { value: 'Mixed', label: 'Mixed' },
];

/**
 * `restrictTo` — when provided, the dropdown only offers these divisions (kept
 * in the canonical Men/Women/Mixed order). Used on the event page so a
 * tournament only lists divisions it actually fielded (Pro Elite has all 3; a
 * Women's-only sectional shows just Women). Omitted → all 3 offered.
 */
export function UsauDivisionSelect({ restrictTo }: { restrictTo?: UsauDivision[] } = {}) {
  const [division, setDivision] = useDivision();
  const options =
    restrictTo && restrictTo.length > 0
      ? OPTIONS.filter((o) => restrictTo.includes(o.value))
      : OPTIONS;
  return (
    <PillSelect
      value={division}
      onChange={setDivision}
      ariaLabel="Select division"
      options={options}
    />
  );
}
