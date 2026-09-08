// /fantasy/l/[contestId]/waivers — the Waivers tab. Chrome from the parent
// layout. Guard: contest must be drafted + weekly-stats mode + draft
// complete + FAAB waivers enabled, else render a one-line gate message.

import { getContest, waiverSettings } from '@/lib/fantasy/leagues';
import { getDraft } from '@/lib/fantasy/draft-room';
import { WaiversPanel } from '@/components/fantasy/waivers/waivers-panel';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function ContestWaiversPage({ params }: { params: { contestId: string } }) {
  const contest = await getContest(params.contestId).catch(() => null);
  if (!contest) return null;

  const isWeekly = contest.settings.mode === 'weekly-stats';
  const isDrafted = contest.settings.draft === true;
  const draft = isDrafted ? await getDraft(contest.id).catch(() => null) : null;
  const draftComplete = draft?.status === 'complete';
  const isFaab = waiverSettings(contest.settings).mode === 'faab';

  if (!isWeekly || !isDrafted || !draftComplete || !isFaab) {
    return (
      <div className="bg-surface rounded-card-lg shadow-card p-10 text-center">
        <p className="font-tight text-[14px] text-muted">
          Waivers open once this league&apos;s draft is complete and FAAB bidding is turned on.
        </p>
      </div>
    );
  }

  return <WaiversPanel contest={contest} />;
}
