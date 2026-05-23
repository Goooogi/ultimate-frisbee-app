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

export function UsauDivisionSelect() {
  const [division, setDivision] = useDivision();
  return (
    <PillSelect
      value={division}
      onChange={setDivision}
      ariaLabel="Select division"
      options={OPTIONS}
    />
  );
}
