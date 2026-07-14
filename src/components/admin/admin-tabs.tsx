'use client';

// Admin portal tab bar + tab-body switcher. Owns the active-tab state (synced
// to ?tab= so refresh/deep-link/back-button all work) and renders only the
// active section — the two admin sections used to both render on one long
// scrolling page; now only one mounts at a time.
//
// Visual language matches LeagueTabs (src/components/league-tabs.tsx): a
// rounded-full bg-ink/5 track, active pill bg-ink/text-bg, inactive pills
// text-muted/hover:text-ink, counts shown at reduced opacity.

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { AdminContentQueue } from '@/components/admin/admin-content-queue';
import { AdminFeedbackList } from '@/components/admin/admin-feedback-list';
import type { PlayerContentItem } from '@/lib/player-content/types';
import type { FeedbackItem } from '@/lib/feedback/server';

export type AdminTab = 'content' | 'feedback';

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'content', label: 'Content' },
  { id: 'feedback', label: 'Feedback' },
];

interface AdminPortalProps {
  pending: PlayerContentItem[];
  recent: PlayerContentItem[];
  feedback: FeedbackItem[];
  newFeedback: number;
  initialTab: AdminTab;
}

export function AdminPortal({ pending, recent, feedback, newFeedback, initialTab }: AdminPortalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawTab = searchParams.get('tab');
  const activeTab: AdminTab = rawTab === 'feedback' ? 'feedback' : rawTab === 'content' ? 'content' : initialTab;

  const counts: Record<AdminTab, number> = {
    content: pending.length,
    feedback: newFeedback,
  };

  function setTab(tab: AdminTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  return (
    <div>
      <AdminTabBar active={activeTab} counts={counts} onChange={setTab} />

      {activeTab === 'content' && (
        <section aria-labelledby="admin-content-heading" role="tabpanel" id="admin-panel-content" aria-label="Content review">
          <h2 id="admin-content-heading" className="sr-only">
            Content review
          </h2>
          <StatusPillRow>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg">
              {pending.length} pending
            </span>
            <a
              href="#recent"
              className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink/5 text-muted hover:text-ink hover:bg-ink/10 transition-colors"
            >
              {recent.length} recent
            </a>
          </StatusPillRow>
          <AdminContentQueue pending={pending} recent={recent} />
        </section>
      )}

      {activeTab === 'feedback' && (
        <section aria-labelledby="admin-feedback-heading" role="tabpanel" id="admin-panel-feedback" aria-label="Feedback inbox">
          <h2 id="admin-feedback-heading" className="sr-only">
            Feedback inbox
          </h2>
          <StatusPillRow>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink text-bg">
              {newFeedback} new
            </span>
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-ink/5 text-muted">
              {feedback.length} total
            </span>
          </StatusPillRow>
          <AdminFeedbackList items={feedback} />
        </section>
      )}
    </div>
  );
}

function StatusPillRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2 text-[11px] font-bold tracking-[0.16em] uppercase font-tight">
      {children}
    </div>
  );
}

function AdminTabBar({
  active,
  counts,
  onChange,
}: {
  active: AdminTab;
  counts: Record<AdminTab, number>;
  onChange: (tab: AdminTab) => void;
}) {
  return (
    <div className="mb-6 -mx-5 px-5 lg:mx-0 lg:px-0 overflow-x-auto no-scrollbar">
      <div
        role="tablist"
        aria-label="Admin sections"
        className="inline-flex rounded-full bg-ink/5 p-[3px] gap-[2px]"
      >
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`admin-tab-${t.id}`}
              aria-selected={on}
              aria-controls={`admin-panel-${t.id}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                // Arrow-key roving between tabs (WAI-ARIA tablist pattern).
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const i = TABS.findIndex((x) => x.id === active);
                const nextIdx =
                  e.key === 'ArrowRight' ? (i + 1) % TABS.length : (i - 1 + TABS.length) % TABS.length;
                const next = TABS[nextIdx];
                onChange(next.id);
                // Move focus to the newly-selected tab.
                document.getElementById(`admin-tab-${next.id}`)?.focus();
              }}
              className={[
                'rounded-full font-sans font-bold tracking-[0.14em] uppercase transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                'px-4 py-2.5 min-h-[44px] text-[11px] whitespace-nowrap cursor-pointer',
                'flex items-center',
                on ? 'bg-ink text-bg' : 'bg-transparent text-muted hover:text-ink',
              ].join(' ')}
            >
              {t.label}
              <span className={`ml-1.5 tabular ${on ? 'opacity-70' : 'opacity-50'}`}>
                {counts[t.id]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
