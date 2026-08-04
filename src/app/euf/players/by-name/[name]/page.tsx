// /euf/players/by-name/[name] — one EUF player's career, merged across events.
//
// Routed BY NAME, not by id: EUF player ids are per-event (the same human gets a
// new id at each event), so the name is the only stable key. Mirrors the WFDF
// by-name route for the same reason.

import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getPlayerProfileByName } from '@/lib/euf/data';
import { EufFlag } from '@/components/euf/euf-flag';

export const revalidate = 300;

interface Props {
  params: { name: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const name = decodeURIComponent(params.name);
  return { title: `${name} · EUCS · The Layout` };
}

export default async function EufPlayerPage({ params }: Props) {
  const name = decodeURIComponent(params.name);
  const profile = await getPlayerProfileByName(name);
  if (!profile) notFound();

  const { totals, appearances } = profile;
  // Most-recent CLUB, not nationality — 1.9% of EUF players appear for clubs in
  // more than one country, so labelling the country alone would misread as a
  // passport. Name the club it came from.
  const latest = appearances[0];
  const clubLine = latest ? `${latest.teamName} (${latest.countryName ?? '—'})` : null;

  return (
    <PageShell
      title={profile.fullName}
      eyebrow="EUCS · Player"
      subtitle={[clubLine, `${totals.events} ${totals.events === 1 ? 'event' : 'events'}`]
        .filter(Boolean)
        .join(' · ')}
      stickyName={profile.fullName}
      breadcrumbs={[
        { label: 'Home', href: '/' },
        { label: 'EUCS', href: '/euf/events' },
        { label: profile.fullName },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Career totals */}
        <section className="grid grid-cols-4 gap-2">
          {[
            ['Games', totals.games],
            ['Goals', totals.goals],
            ['Assists', totals.assists],
            ['Points', totals.points],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-card bg-surface shadow-card p-3">
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase text-faint font-tight">
                {label}
              </p>
              <p className="text-[20px] font-semibold text-ink font-tight tabular-nums">{value}</p>
            </div>
          ))}
        </section>

        {/* Appearance-by-appearance */}
        <section>
          <h2 className="text-[10px] font-bold tracking-[0.18em] uppercase text-muted font-tight pb-2 border-b border-hairline">
            Event History
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse">
              <thead>
                <tr className="text-[10px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
                  <th className="text-left py-2 pr-2 font-bold">Event</th>
                  <th className="text-left py-2 px-2 font-bold">Team</th>
                  <th className="text-right py-2 px-2 font-bold">Fin</th>
                  <th className="text-right py-2 px-2 font-bold">GP</th>
                  <th className="text-right py-2 px-2 font-bold">G</th>
                  <th className="text-right py-2 px-2 font-bold">A</th>
                  <th className="text-right py-2 pl-2 font-bold">Pts</th>
                </tr>
              </thead>
              <tbody>
                {appearances.map((a, i) => (
                  <tr key={`${a.teamId}-${i}`} className="border-t border-hairline">
                    <td className="py-2 pr-2 text-[13px] font-tight">
                      <Link
                        href={`/euf/events/${a.eventSlug}`}
                        className="no-underline hover:underline text-ink"
                      >
                        {a.eventName}
                      </Link>
                      <span className="text-muted ml-1.5 text-[11px]">{a.division}</span>
                    </td>
                    <td className="py-2 px-2 text-[13px] font-tight">
                      <Link
                        href={`/euf/clubs/${encodeURIComponent(a.teamName)}?div=${encodeURIComponent(a.division)}&season=${a.year}`}
                        className="inline-flex items-center gap-1.5 no-underline hover:underline text-muted min-w-0"
                      >
                        <EufFlag countryName={a.countryName} size={13} />
                        <span className="truncate">{a.teamName}</span>
                      </Link>
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-muted">
                      {a.finalPlacement ?? '–'}
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-muted">
                      {a.games ?? '–'}
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-ink">
                      {a.goals ?? 0}
                    </td>
                    <td className="text-right py-2 px-2 text-[13px] font-tight tabular-nums text-muted">
                      {a.assists ?? 0}
                    </td>
                    <td className="text-right py-2 pl-2 text-[13px] font-tight tabular-nums text-ink font-semibold">
                      {a.total ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
