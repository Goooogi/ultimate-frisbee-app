'use client';

// WantForm — post an "ISO" (in search of). Deliberately lighter than the
// listing form: no photos (you don't have the jersey), no price, no condition.
//
// Any ONE of team / player / league / year is enough. Someone hunting "a 2019
// Machine jersey" and someone hunting "anything Clapham" are both valid, and
// demanding more would just cost us posts.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { EntityInput, type EntityValue } from '@/components/jerseys/entity-input';
import { EventPicker, type EventDraft } from '@/components/jerseys/event-picker';
import { createWant, updateWant } from '@/lib/jerseys/data';
import { JERSEY_SIZES, MAX_DESCRIPTION, type JerseyWant } from '@/lib/jerseys/types';

const SIZE_OPTIONS: PillSelectOption<string>[] = [
  { value: '', label: 'Any size' },
  ...JERSEY_SIZES.map((s) => ({ value: s, label: s })),
];

export function WantForm({ existing }: { existing?: JerseyWant }) {
  const router = useRouter();
  const [team, setTeam] = useState<EntityValue>({
    name: existing?.teamName ?? '',
    league: existing?.league ?? null,
    entityId: existing?.teamId ?? null,
    logoUrl: existing?.teamLogoUrl ?? null,
  });
  const [player, setPlayer] = useState<EntityValue>({
    name: existing?.playerName ?? '',
    league: null,
    entityId: null,
    logoUrl: null,
  });
  const [leagueName, setLeagueName] = useState(existing?.leagueName ?? '');
  const [year, setYear] = useState(existing?.year ? String(existing.year) : '');
  const [size, setSize] = useState(existing?.size ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [stateRegion, setStateRegion] = useState(existing?.state ?? '');
  const [country, setCountry] = useState(existing?.country ?? '');
  const [events, setEvents] = useState<EventDraft[]>(
    existing?.events.map((e) => ({
      usauEventId: e.usauEventId,
      name: e.name,
      startsOn: e.startsOn,
    })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasTarget =
    Boolean(team.name.trim()) || Boolean(player.name.trim()) || Boolean(leagueName.trim()) || Boolean(year);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    const draft = {
      league: team.entityId ? team.league : null,
      teamId: team.entityId,
      teamName: team.name || null,
      teamLogoUrl: team.logoUrl,
      leagueName: leagueName || null,
      playerName: player.name || null,
      year: year ? Number(year) : null,
      size: size || null,
      note: note || null,
      city: city || null,
      state: stateRegion || null,
      country: country || null,
      events: events.map((e) => ({ usauEventId: e.usauEventId, name: e.name, startsOn: e.startsOn })),
    };

    if (existing) {
      const err = await updateWant(existing.id, draft);
      setBusy(false);
      if (err) {
        setError(err);
        return;
      }
      router.push(`/jerseys/wanted/${existing.id}`);
      router.refresh();
      return;
    }

    const { error: err, id } = await createWant(draft);
    setBusy(false);
    if (err || !id) {
      setError(err ?? 'Could not post that.');
      return;
    }
    router.push('/jerseys?tab=wants');
    router.refresh();
  }, [team, player, leagueName, year, size, note, city, stateRegion, country, events, existing, router]);

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display italic text-xl font-bold text-ink">What are you after?</h2>
          <p className="text-[11.5px] text-faint font-tight">
            Fill in whatever you know — a team, a player, a league, or just a year.
          </p>
        </div>

        <EntityInput
          id="w-team"
          kind="team"
          label="Team"
          placeholder="Any team — ours or not"
          value={team}
          onChange={setTeam}
        />
        <EntityInput
          id="w-player"
          kind="player"
          label="Player"
          placeholder="Anyone in particular?"
          value={player}
          onChange={setPlayer}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="w-league" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
              League
            </label>
            <input
              id="w-league"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={80}
              placeholder="UFA, Windmill…"
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="w-year" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
              Year
            </label>
            <input
              id="w-year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="2019"
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="w-size" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
            Size
          </label>
          <PillSelect value={size} options={SIZE_OPTIONS} onChange={setSize} ariaLabel="Size" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="w-note" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
            Note
          </label>
          <textarea
            id="w-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            rows={3}
            placeholder="What you'd trade for it, how flexible you are on size…"
            className={`${inputClass} resize-none py-2.5`}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display italic text-xl font-bold text-ink">Where are you?</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="w-city" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">City</label>
            <input id="w-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} placeholder="Boston" autoComplete="address-level2" className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="w-state" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">State / region</label>
            <input id="w-state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} maxLength={60} placeholder="MA" autoComplete="address-level1" className={inputClass} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="w-country" className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">Country</label>
          <input id="w-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} placeholder="USA" autoComplete="country-name" className={inputClass} />
        </div>
        <EventPicker value={events} onChange={setEvents} />
      </section>

      {error && (
        <p className="text-[12.5px] text-accent font-tight rounded-card bg-surface shadow-card px-4 py-3" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!hasTarget || busy}
        className={[
          'inline-flex items-center justify-center min-h-[52px] rounded-full shadow-hero',
          'text-[12.5px] font-bold tracking-[0.08em] uppercase font-tight',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          hasTarget && !busy
            ? 'bg-accent text-accent-ink hover:opacity-90 cursor-pointer'
            : 'bg-surface text-faint cursor-not-allowed',
        ].join(' ')}
      >
        {busy ? 'Saving…' : existing ? 'Save changes' : 'Post what I’m after'}
      </button>
    </div>
  );
}

const inputClass =
  'w-full px-3 min-h-[44px] rounded-card bg-surface shadow-card text-[13.5px] text-ink font-tight placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';
