'use client';

// RecentActivityCard — LeagueView's compact activity teaser (private leagues
// only, mounted directly under DraftCard). Up to 5 newest feed entries;
// hides itself entirely when there's nothing to show.
//
// Web port of the mobile app's RecentActivityCard.tsx
// (altiusapps/mobileapp-thelayout · src/components/fantasy/).

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  getLeagueActivity,
  getLeagueMessages,
  mergeFeed,
  activityText,
  type ActivityItem,
  type LeagueMessage,
  type FeedEntry,
} from '@/lib/fantasy/feed';
import { getLeagueMembers, getMyLeagueRole, type ContestView, type LeagueMember } from '@/lib/fantasy/leagues';
import { useAuth } from '@/lib/auth/auth-provider';

const PREVIEW_LIMIT = 5;

export function RecentActivityCard({ contest }: { contest: ContestView }) {
  const { user } = useAuth();
  const leagueId = contest.leagueId as string;

  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [messages, setMessages] = useState<LeagueMessage[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsMember(false);
      return;
    }
    let cancelled = false;
    getMyLeagueRole(leagueId)
      .then((role) => !cancelled && setIsMember(role != null))
      .catch(() => !cancelled && setIsMember(false));
    return () => {
      cancelled = true;
    };
  }, [user, leagueId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getLeagueActivity(leagueId, 10).catch(() => []),
      isMember ? getLeagueMessages(leagueId).catch(() => []) : Promise.resolve([]),
      getLeagueMembers(leagueId).catch(() => []),
    ]).then(([a, m, mem]) => {
      if (cancelled) return;
      setActivity(a);
      setMessages(m);
      setMembers(mem);
    });
    return () => {
      cancelled = true;
    };
  }, [leagueId, isMember]);

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.userId, m.displayName ?? m.username ?? 'Member');
    return map;
  }, [members]);

  const preview = useMemo(() => mergeFeed(activity, messages).slice(0, PREVIEW_LIMIT), [activity, messages]);

  if (preview.length === 0) return null;

  return (
    <section aria-labelledby="activity-heading">
      <div className="flex items-center justify-between mb-4">
        <h2
          id="activity-heading"
          className="text-[11px] font-bold tracking-[0.16em] uppercase text-muted font-tight"
        >
          Activity
        </h2>
        <Link
          href={`/fantasy/l/${contest.id}/feed`}
          className="text-[11px] font-bold tracking-[0.06em] uppercase text-muted font-tight hover:text-accent transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-card-sm"
        >
          See all
        </Link>
      </div>
      <div className="bg-surface rounded-card-lg shadow-card overflow-hidden">
        {preview.map((entry, idx) => (
          <div
            key={`${entry.type}:${entry.item.id}`}
            className={['px-[18px] py-3', idx > 0 ? 'border-t border-hairline' : ''].join(' ')}
          >
            <p className="font-tight text-[13px] text-ink truncate m-0">{lineFor(entry, nameByUserId)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function lineFor(entry: FeedEntry, nameByUserId: Map<string, string>): string {
  if (entry.type === 'activity') return activityText(entry.item);
  const name = nameByUserId.get(entry.item.userId) ?? 'Member';
  return `${name}: ${entry.item.body}`;
}

export default RecentActivityCard;
