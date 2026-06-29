// /wul/scores — WUL completed games, grouped by week (most recent first).
// Mirrors src/app/pul's scores branch (the PUL branch of /scores/page.tsx).
// Server component; season is fixed to WUL_CURRENT_SEASON (no switcher needed
// until WUL carries multiple archived seasons).

import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { WulScores } from '@/components/wul/wul-scores';
import { WUL_CURRENT_SEASON } from '@/lib/wul/data';

export const revalidate = 300; // 5 min — scores update during season

export const metadata: Metadata = {
  title: `WUL Scores · ${WUL_CURRENT_SEASON} · The Layout`,
  description: `${WUL_CURRENT_SEASON} Western Ultimate League scores and results.`,
};

export default function WulScoresPage() {
  return (
    <PageShell
      title="Scores"
      eyebrow={`WUL · Western Ultimate League · ${WUL_CURRENT_SEASON}`}
      topNavSlot={<span />}
    >
      <WulScores season={WUL_CURRENT_SEASON} />
    </PageShell>
  );
}
