// /euf/clubs/[name]?div= — one EUCS club-division across every event it entered.
//
// Routed BY NAME for the same reason the player route is: EUF team ids are
// PER-EVENT, so the name is the only stable key for a club. Division rides in a
// query param because clubs like Grut field Open, Women's AND Mixed squads —
// different rosters that share a name, so they get separate pages. This is the
// identity layer over /euf/teams/[id], which stays the single-event view.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getClubProfile, getClubCrossLeague, EUF_DIVISIONS } from '@/lib/euf/data';
import { EufFlag } from '@/components/euf/euf-flag';

export const revalidate = 300;

interface Props {
  params: { name: string };
  searchParams: { div?: string };
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** Resolve ?div= against the known division list; defaults to Open. */
function divisionOf(raw: string | undefined): string {
  const match = EUF_DIVISIONS.find((d) => d.toLowerCase() === (raw ?? '').trim().toLowerCase());
  return match ?? 'Open';
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const name = decodeURIComponent(params.name);
  return { title: `${name} · ${divisionOf(searchParams.div)} · EUCS · The Layout` };
}

export default async function EufClubPage({ params, searchParams }: Props) {
  const name = decodeURIComponent(params.name);
  const division = divisionOf(searchParams.div);
  const club = await getClubProfile(name, division);
  if (!club) notFound();

  const cross = await getClubCrossLeague(club.name, club.division).catch(() => []);
  const { totals, appearances } = club;

  return (
    <PageShell
      title={club.name}
      eyebrow={`EUCS · ${club.division}`}
      subtitle={[
        club.countryName,
        `${totals.events} ${totals.events === 1 ? 'event' : 'events'}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      stickyName={club.name}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: 'Clubs', href: '/euf/clubs' },
        { label: `${club.name} · ${club.division}` },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Other squads under the same club name — Grut fields Open, Women's
            and Mixed, and each is a separate roster with its own page. */}
        {club.siblingDivisions.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
              Also fields
            </span>
            {club.siblingDivisions.map((d) => (
              <Link
                key={d}
                href={`/euf/clubs/${encodeURIComponent(club.name)}?div=${encodeURIComponent(d)}`}
                className="text-[11px] font-tight text-ink no-underline px-2 py-0.5 rounded-full border border-hairline hover:bg-ink/[0.04] transition-colors"
              >
                {d}
              </Link>
            ))}
          </div>
        )}
        {/* Career totals */}
        <section className="grid grid-cols-4 gap-2">
          {[
            ['Events', totals.events],
            ['Games', totals.games],
            ['Record', `${totals.wins}–${totals.losses}`],
            ['Titles', totals.titles],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-card bg-surface shadow-card p-3 min-w-0">
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
                {label}
              </p>
              {/* Record ("14–15") is the widest value and wraps at 390px in a
                  quarter-width tile, so step the size up only once there's room. */}
              <p className="text-[17px] sm:text-[20px] font-semibold text-ink font-tight tabular-nums whitespace-nowrap">
                {value}
              </p>
            </div>
          ))}
        </section>

        {/* Event-by-event */}
        <section>
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
            Event History
          </h2>
          <div className="overflow-x-auto">
            {/* Only 4 columns (vs the player page's 7), so this fits a 390px
                screen — no min-width, or Fin/W–L/Diff scroll off-screen. */}
            <table className="w-full min-w-[300px] border-collapse">
              <thead>
                <tr className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
                  <th className="text-left py-2 pr-2 font-bold">Event</th>
                  <th className="text-right py-2 px-2 font-bold">Fin</th>
                  <th className="text-right py-2 px-2 font-bold">W–L</th>
                  <th className="text-right py-2 pl-2 font-bold">Diff</th>
                </tr>
              </thead>
              <tbody>
                {appearances.map((a) => (
                  <tr key={a.teamId} className="border-t border-hairline">
                    <td className="py-2 pr-2 text-[13px] font-tight">
                      {/* Links to the per-event team row: roster + results live there. */}
                      <Link
                        href={`/euf/teams/${a.teamId}`}
                        className="no-underline hover:underline text-ink"
                      >
                        {a.eventName}
                      </Link>
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-ink">
                      {a.finalPlacement ? ordinal(a.finalPlacement) : '–'}
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-muted">
                      {a.wins}–{a.losses}
                    </td>
                    <td className="text-right py-2 pl-2 text-[13px] font-tight tabular-nums text-muted">
                      {a.scoresFor - a.scoresAgainst > 0 ? '+' : ''}
                      {a.scoresFor - a.scoresAgainst}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Appearances outside EUCS. Matched on exact name + country (WFDF) or
            U.S.-Open-only participation (USAU) — see get_euf_club_cross_league. */}
        {cross.length > 0 && (
          <section>
            <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
              Also Played
            </h2>
            <ul className="list-none p-0 m-0">
              {cross.map((c) => (
                <li
                  key={`${c.league}-${c.refId}-${c.year}-${c.eventName}`}
                  className="flex items-start gap-3 py-2 border-t border-hairline first:border-t-0"
                >
                  <span className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint font-tight w-10 flex-shrink-0 pt-0.5">
                    {c.league === 'usau' ? 'USAU' : 'WFDF'}
                  </span>
                  {/* Event names here are long ("2025 U.S. Open Club
                      Championships (ICC)") — wrap rather than truncate, or the
                      whole label is unreadable on a phone. */}
                  <span className="flex items-start gap-1.5 min-w-0 flex-1 text-[13px] font-tight text-ink">
                    <span className="flex-shrink-0 pt-0.5">
                      <EufFlag countryName={c.countryName} size={13} />
                    </span>
                    <Link
                      href={
                        c.league === 'usau'
                          ? `/usau/events/${c.eventSlug}`
                          : `/wfdf/events/${c.eventSlug}`
                      }
                      className="no-underline hover:underline text-ink"
                    >
                      {c.eventName}
                    </Link>
                  </span>
                  {c.division && (
                    <span className="text-[11px] text-muted font-tight flex-shrink-0 pt-0.5">
                      {c.division}
                    </span>
                  )}
                  <span className="text-[11px] text-muted font-tight tabular-nums flex-shrink-0 pt-0.5">
                    {c.year}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
