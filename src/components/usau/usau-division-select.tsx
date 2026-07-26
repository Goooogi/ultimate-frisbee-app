'use client';

// USAU division dropdown — Men / Women / Mixed. Used as a `controls`
// slot on USAU pages (Schedule, Teams, Players) and inline on the
// /scores USAU view. Renders via the shared PillSelect primitive so
// the popover matches the rest of the chrome.

import { useEffect, useMemo } from 'react';
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
  // Stable ref so the correction effect doesn't re-run every render. Key on the
  // restricted set's contents, not the array identity.
  const restrictKey = restrictTo ? restrictTo.join(',') : '';
  const options = useMemo(
    () =>
      restrictTo && restrictTo.length > 0
        ? OPTIONS.filter((o) => restrictTo.includes(o.value))
        : OPTIONS,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restrictKey],
  );

  // The active division comes from the shared ?div= param (default Men), which
  // may be a division this event never fielded — e.g. landing on a Women/Mixed-
  // only tournament while div=men. That left the pill blank (no matching option)
  // AND left the page filtering by an empty division. Snap to the first fielded
  // division so the control always shows a valid, present value.
  const inRange = options.some((o) => o.value === division);
  useEffect(() => {
    if (!inRange && options.length > 0) {
      setDivision(options[0].value);
    }
  }, [inRange, options, setDivision]);

  // Render the effective value (first available) while the URL correction is in
  // flight, so there's never a blank frame.
  const effective = inRange ? division : options[0]?.value ?? division;

  return (
    <PillSelect
      value={effective}
      onChange={setDivision}
      ariaLabel="Select division"
      options={options}
    />
  );
}
