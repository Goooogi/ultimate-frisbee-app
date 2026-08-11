'use client';

// JerseyForm — create or edit a listing. One scrolling form, mobile-first.
//
// Only the title is required. Everything else is optional because a real
// listing might be "Bravo jersey, size L, DM me" with a photo and nothing else
// — demanding structured metadata would just cost us listings.
//
// Photos upload AFTER the listing row exists, since the storage path embeds
// the listing id. On create we insert first, then upload, then navigate.

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PillSelect, type PillSelectOption } from '@/components/pill-select';
import { EntityInput, type EntityValue } from '@/components/jerseys/entity-input';
import { EventPicker, type EventDraft } from '@/components/jerseys/event-picker';
import { PhotoUpload, type PendingPhoto } from '@/components/jerseys/photo-upload';
import { createListing, updateListing, uploadListingPhoto } from '@/lib/jerseys/data';
import {
  JERSEY_CONDITIONS,
  JERSEY_SIZES,
  MAX_TITLE,
  MAX_DESCRIPTION,
  type JerseyKind,
  type JerseyCondition,
  type JerseyListing,
} from '@/lib/jerseys/types';

const CONDITION_OPTIONS: PillSelectOption<string>[] = [
  { value: '', label: 'Not specified' },
  ...JERSEY_CONDITIONS.map((c) => ({ value: c.value, label: c.label })),
];
const SIZE_OPTIONS: PillSelectOption<string>[] = [
  { value: '', label: 'Not specified' },
  ...JERSEY_SIZES.map((s) => ({ value: s, label: s })),
];

export function JerseyForm({ existing }: { existing?: JerseyListing }) {
  const router = useRouter();

  const [title, setTitle] = useState(existing?.title ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [size, setSize] = useState(existing?.size ?? '');
  const [condition, setCondition] = useState<string>(existing?.condition ?? '');

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

  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);

    const draft = {
      // Listings are trades/gifts only — the sell option (and price) was
      // removed 2026-08-11; every listing, including edits of old 'sell'
      // rows, is normalized to 'trade'.
      kind: 'trade' as JerseyKind,
      title,
      description,
      size: size || null,
      condition: (condition || null) as JerseyCondition | null,
      priceCents: null,
      // Structured refs only survive when the user PICKED from our data.
      league: team.entityId ? team.league : null,
      teamId: team.entityId,
      teamName: team.name || null,
      teamLogoUrl: team.logoUrl,
      leagueName: leagueName || null,
      playerName: player.name || null,
      year: year ? Number(year) : null,
      city: city || null,
      state: stateRegion || null,
      country: country || null,
      events: events.map((e) => ({
        usauEventId: e.usauEventId,
        name: e.name,
        startsOn: e.startsOn,
      })),
    };

    if (existing) {
      const err = await updateListing(existing.id, draft);
      if (err) {
        setError(err);
        setBusy(false);
        return;
      }
      // Any newly added photos still need uploading on edit.
      if (photos.length > 0) {
        setProgress('Uploading photos…');
        for (let i = 0; i < photos.length; i++) {
          const upErr = await uploadListingPhoto(existing.id, photos[i].file, existing.photos.length + i);
          if (upErr) {
            setError(upErr);
            setBusy(false);
            return;
          }
        }
      }
      router.push(`/jerseys/${existing.id}`);
      router.refresh();
      return;
    }

    const { error: err, id } = await createListing(draft);
    if (err || !id) {
      setError(err ?? 'Could not create that listing.');
      setBusy(false);
      return;
    }

    // Photos go up after the row exists — the storage path embeds the id.
    // A photo failure does NOT discard the listing; we surface it and let the
    // user retry from the edit screen rather than losing everything they typed.
    if (photos.length > 0) {
      setProgress(`Uploading ${photos.length} photo${photos.length > 1 ? 's' : ''}…`);
      for (let i = 0; i < photos.length; i++) {
        const upErr = await uploadListingPhoto(id, photos[i].file, i);
        if (upErr) {
          setError(`Listing saved, but a photo failed: ${upErr}`);
          setBusy(false);
          router.push(`/jerseys/${id}`);
          return;
        }
      }
    }

    router.push(`/jerseys/${id}`);
    router.refresh();
  }, [
    title, description, size, condition, team, player, leagueName,
    year, city, stateRegion, country, events, photos, existing, router,
  ]);

  const canSubmit = title.trim().length >= 3 && !busy;

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <Section title="What is it?">
        <Field label="Title" htmlFor="j-title" hint="Required">
          <input
            id="j-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder="e.g. New York Empire 2025"
            className={inputClass}
          />
        </Field>

        <Field label="Photos" htmlFor="j-photos" hint="Up to 6 — a photo is what sells it">
          <PhotoUpload
            pending={photos}
            existing={existing?.photos ?? []}
            onChange={setPhotos}
            listingId={existing?.id ?? null}
          />
        </Field>
      </Section>

      <Section title="Which jersey?" note="All optional — fill in whatever you know.">
        <EntityInput
          id="j-team"
          kind="team"
          label="Team"
          placeholder="Any team — ours or not"
          value={team}
          onChange={setTeam}
        />
        <EntityInput
          id="j-player"
          kind="player"
          label="Player"
          placeholder="Whose jersey is it?"
          value={player}
          onChange={setPlayer}
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="League" htmlFor="j-league">
            <input
              id="j-league"
              value={leagueName}
              onChange={(e) => setLeagueName(e.target.value)}
              maxLength={80}
              placeholder="UFA, UK Ultimate…"
              className={inputClass}
            />
          </Field>
          <Field label="Year" htmlFor="j-year">
            <input
              id="j-year"
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder="2025"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size" htmlFor="j-size">
            <PillSelect value={size} options={SIZE_OPTIONS} onChange={setSize} ariaLabel="Size" />
          </Field>
          <Field label="Condition" htmlFor="j-condition">
            <PillSelect
              value={condition}
              options={CONDITION_OPTIONS}
              onChange={setCondition}
              ariaLabel="Condition"
            />
          </Field>
        </div>
        <Field label="Details" htmlFor="j-desc">
          <textarea
            id="j-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            rows={4}
            placeholder="Anything a trader should know — flaws, fit, what you're after in return."
            className={`${inputClass} resize-none py-2.5`}
          />
        </Field>
      </Section>

      <Section title="Where are you?" note="Helps people judge whether a meetup is realistic.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" htmlFor="j-city">
            <input id="j-city" value={city} onChange={(e) => setCity(e.target.value)} maxLength={100} placeholder="Denver" className={inputClass} />
          </Field>
          <Field label="State / region" htmlFor="j-state">
            <input id="j-state" value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} maxLength={60} placeholder="CO" className={inputClass} />
          </Field>
        </div>
        <Field label="Country" htmlFor="j-country">
          <input id="j-country" value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60} placeholder="USA" className={inputClass} />
        </Field>
        <EventPicker value={events} onChange={setEvents} />
      </Section>

      {error && (
        <p className="text-[12.5px] text-accent font-tight rounded-card bg-surface shadow-card px-4 py-3" role="alert">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className={[
          'w-full inline-flex items-center justify-center min-h-[52px] rounded-full',
          'text-[12.5px] font-bold tracking-[0.08em] uppercase font-tight shadow-hero',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
          'bg-accent text-accent-ink',
          canSubmit ? 'hover:opacity-90 cursor-pointer' : 'opacity-40 cursor-not-allowed',
        ].join(' ')}
      >
        {busy ? (progress ?? 'Saving…') : existing ? 'Save changes' : 'Post listing'}
      </button>

      <p className="text-[11px] text-faint font-tight leading-snug">
        Your listing goes live right away. The Layout doesn&rsquo;t process payments or shipping —
        you arrange the trade directly with the other person.
      </p>
    </div>
  );
}

const inputClass =
  'w-full px-3 min-h-[44px] rounded-card bg-surface shadow-card text-[13.5px] text-ink font-tight placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent';

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="font-display italic text-xl font-bold text-ink">{title}</h2>
        {note && <p className="text-[11.5px] text-faint font-tight">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-bold tracking-[0.12em] uppercase text-muted font-tight">
          {label}
        </span>
        {hint && <span className="text-[10px] text-faint font-tight">{hint}</span>}
      </label>
      {children}
    </div>
  );
}
