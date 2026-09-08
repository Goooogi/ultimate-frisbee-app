// /fantasy/l/[contestId]/trades — the Trades tab. Chrome from the parent
// layout. Guard: contest must be drafted + weekly-stats mode + draft
// complete, else render a one-line gate message.

import { getContest } from '@/lib/fantasy/leagues';
import { getDraft } from '@/lib/fantasy/draft-room';
import { TradesPanel } from '@/components/fantasy/trades/trades-panel';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function ContestTradesPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest) return null;

  const isWeekly = contest.settings.mode === 'weekly-stats';
  const isDrafted = contest.settings.draft === true;
  const draft = isDrafted ? await getDraft(contest.id).catch(() => null) : null;
  const draftComplete = draft?.status === 'complete';

  if (!isWeekly || !isDrafted || !draftComplete) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="font-tight text-[14px] text-muted">Trades open once the draft is complete.</p>
      </div>
    );
  }

  return <TradesPanel contest={contest} />;
}
