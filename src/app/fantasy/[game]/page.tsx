// /fantasy/[game] — GENERIC GAME HOME for live non-UFA games (Club Nationals
// first, 2026-08-27). UFA keeps its bespoke /fantasy/ufa page (this route
// redirects there); coming-soon and hidden games 404 — the hub never links
// them. Event-mode games get a tournament card (dates + when drafts open —
// the Saturday before the event, mirroring the DB draft window) above the
// standard leagues front door.
//
// App Health rule #3: public [param] route → real ISR (generateStaticParams,
// no searchParams reads), bounded per-render queries (one event lookup).

import { notFound, redirect } from 'next/navigation';
import { PageShell } from '@/components/page-shell';
import { getGame, GAMES, draftOpensDate, formatDateOnly } from '@/lib/fantasy/games';
import { getCompetition } from '@/lib/fantasy/competitions';
import { resolveEventForCompetition } from '@/lib/fantasy/leagues';
import { YourLeagues } from '@/components/fantasy/your-leagues';
import type { Crumb } from '@/components/breadcrumbs';

export const revalidate = 60;

export function generateStaticParams() {
  return GAMES.filter((g) => g.status === 'live' && g.id !== 'ufa').map((g) => ({ game: g.id }));
}

export default async function GameHomePage({ params }: { params: { game: string } }) {
  const game = getGame(params.game);
  if (!game || game.status === 'hidden') notFound();
  if (game.id === 'ufa') redirect('/fantasy/ufa');
  if (game.status !== 'live') notFound();

  const def = getCompetition(game.id);
  const seasonYear = new Date().getFullYear();
  const event =
    def?.mode === 'event'
      ? await resolveEventForCompetition(game.id, seasonYear).catch(() => null)
      : null;
  const draftOpens = event?.startDate ? draftOpensDate(event.startDate) : null;

  const breadcrumbs: Crumb[] = [{ label: 'Fantasy', href: '/fantasy' }, { label: game.name }];

  return (
    <PageShell
      title={game.name}
      eyebrow={game.name}
      subtitle={game.blurb}
      breadcrumbs={breadcrumbs}
      hideFooterMobile
    >
      {/* ── Tournament card (event-mode games) ─────────────────────────── */}
      {event && (
        <section aria-labelledby="event-heading" className="mb-8 lg:mb-10">
          <div className="bg-surface rounded-card-lg shadow-card p-6 lg:p-8">
            <div className="text-[10.5px] font-bold tracking-[0.18em] uppercase text-accent font-sans mb-2">
              Tournament
            </div>
            <h2
              id="event-heading"
              className="font-display italic text-[22px] lg:text-[26px] font-bold tracking-[-0.02em] leading-[0.95] text-ink mb-2"
            >
              {event.name}
            </h2>
            <p className="text-muted font-tight text-[13px] lg:text-[14px] leading-snug max-w-[520px]">
              {event.startDate && (
                <>
                  {formatDateOnly(event.startDate)}
                  {event.endDate && <> – {formatDateOnly(event.endDate)}</>}
                  {' · '}
                </>
              )}
              Draft a roster of tournament players, score their event totals — 3
              pts per goal, 3 pts per assist.
            </p>
            {draftOpens && (
              <p className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 text-accent font-tight text-[12px] font-bold">
                Drafts open {formatDateOnly(draftOpens)} — once teams and rosters are in
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── Your leagues in this game ──────────────────────────────────────
          No Public League for event games (private-leagues-only at launch,
          Hunter's call) — globalPool stays null. */}
      <YourLeagues globalPool={null} />
    </PageShell>
  );
}
