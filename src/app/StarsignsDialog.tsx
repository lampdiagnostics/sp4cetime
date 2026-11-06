import { useEffect, useMemo, useRef, useState } from 'react';
import { HOUSE_SYSTEMS, type HouseSystem } from '../core/houses';
import type { Path, PathPoint } from '../core/path';
import { nearestPlace, parseCoordinate, parsePlaces, type Place, placeForZone, placeLabel, searchPlaces } from '../core/places';
import { readingAt, type Reading } from '../core/reading';
import { formatLat, formatLon } from '../core/spheres';
import { starsignsPath } from '../core/starsigns';
import { fromUnixMs } from '../core/time';
import { MOODS, type Mood } from '../core/ambience';
import type { SkyLink } from '../core/skyLink';
import { playSoundtrack, type Soundtrack, stopSoundtrack } from './sound';
import { formatOffset, localToUtc } from './zones';

const DEG = Math.PI / 180;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** Typed coordinates further than this from any town are taken at UTC (no time zone known). */
const ZONE_REACH_KM = 400;

/** The place list is loaded once, the first time the dialog opens (about 180 KB). */
let placesPromise: Promise<Place[]> | null = null;
const loadPlaces = (base: string): Promise<Place[]> =>
  (placesPromise ??= fetch(`${base}places.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(parsePlaces)
    .catch(() => []));

interface Where {
  readonly label: string;
  /** Short, for captions ("Winnipeg"). */
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  /** IANA zone, or null (the time is then taken as UTC). */
  readonly zone: string | null;
}

/**
 * The gift edition (owner, 5 Nov 2026): a title card at the start of the video (a heading,
 * a message, and the moment and place) and a soundtrack. Shown in the dialog only at
 * sp4cetime.org/?gift, where the owner makes paid orders; the public dialog is unchanged.
 */
export interface Gift {
  readonly heading: string;
  readonly message: string;
  /** The moment and place, small under the message: "21 June 1990, 2:30 pm · Winnipeg". */
  readonly sub: string;
  readonly soundtrack: Soundtrack | null;
  /** The tour as a sky link, for the e-card's QR code. */
  readonly sky?: SkyLink;
}
export const GIFT_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('gift');

/** What the page gives the dialog. */
export interface StarsignsActions {
  /** The look and calendar now, for the path to start from. */
  base: () => PathPoint | null;
  /** ▶ Go: save the path (listed in ▷ Paths), fly and record it; the Download package pops up at the end. */
  go: (path: Path, gift?: Gift) => void;
}

const pad = (n: number): string => String(n).padStart(2, '0');
const today = (): { date: string; time: string } => {
  const d = new Date();
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
};
const fmt = (x: number): string => (Math.round(x * 10_000) / 10_000).toString();

/**
 * ✶ Starsigns (0.4.0, ADR-0018). Opens on this moment and this device's place; ▷ Go flies
 * the free path (signs from above, the planets one by one, the sky over the place, the
 * wheel). Place: type it (a completer like a transit app's: arrows, Tab or Enter, a tap),
 * or type latitude and longitude and the nearest town fills in. A blank time means noon.
 * ▶ Go (owner, 4 Nov 2026) saves the path, flies it and records it (an MP4 made for X); at the
 * end the Download package pops up (PackageDialog: the video, a PDF of its last frame with the
 * signs and houses, the path token; free), with ✶ Customize and ☕ Buy me a coffee leading to
 * sp4cetime.store. No prices on this site. Never in a capture.
 */
export function StarsignsDialog({ onClose, actions }: { onClose: () => void; actions: StarsignsActions }) {
  const start = useMemo(today, []);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const [query, setQuery] = useState('');
  const [latText, setLatText] = useState('');
  const [lonText, setLonText] = useState('');
  const [where, setWhere] = useState<Where | null>(null);
  const [system, setSystem] = useState<HouseSystem>('whole');
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const listOpen = useRef(false);
  // The gift (only at ?gift).
  const [heading, setHeading] = useState('');
  const [message, setMessage] = useState('');
  const [track, setTrack] = useState<'hum' | Mood | 'file'>('hum');
  const [file, setFile] = useState<{ data: ArrayBuffer; name: string } | null>(null);
  const [listening, setListening] = useState(false);
  const [trackError, setTrackError] = useState('');
  useEffect(() => () => stopSoundtrack(0.3), []);

  const fromPlace = (p: Place, how: 'chosen' | 'near', km = 0): void => {
    setWhere({ label: placeLabel(p), name: p.name, lat: p.lat, lon: p.lon, zone: p.zone });
    setQuery(how === 'near' && km > 2 ? `near ${placeLabel(p)} (${Math.round(km)} km)` : placeLabel(p));
    setLatText(fmt(p.lat));
    setLonText(fmt(p.lon));
    setOpen(false);
  };
  /** Coordinates typed (or from the device): the nearest town gives the name and the time zone. */
  const fromCoords = (lat: number, lon: number, list = places): void => {
    const n = nearestPlace(list, lat, lon);
    const within = n && n.km <= ZONE_REACH_KM;
    const label = within ? (n.km > 2 ? `near ${placeLabel(n.place)} (${Math.round(n.km)} km)` : placeLabel(n.place)) : `${formatLat(lat * DEG, 0)} · ${formatLon(lon * DEG, 0)}`;
    setWhere({ label: within ? placeLabel(n.place) : label, name: within ? n.place.name : 'this place', lat, lon, zone: within ? n.place.zone : null });
    setQuery(label);
  };

  useEffect(() => {
    // Start from this device's place: the largest town in its time zone (no permission asked).
    void loadPlaces(import.meta.env.BASE_URL).then((list) => {
      setPlaces(list);
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const p = placeForZone(list, zone);
      if (p) fromPlace(p, 'chosen');
    });
    const esc = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      // Esc closes the list of places first, then the dialog.
      if (listOpen.current) setOpen(false);
      else onClose();
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const matches = useMemo(() => (open ? searchPlaces(places, query, 7) : []), [places, query, open]);
  listOpen.current = matches.length > 0;
  useEffect(() => setActive(0), [query]);

  // The moment: local clock time in the place's zone → UTC. A blank time is noon.
  const moment = useMemo(() => {
    const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const noTime = !/^\d{1,2}:\d{2}/.test(time);
    const tm = (noTime ? '12:00' : time).match(/^(\d{1,2}):(\d{2})/);
    if (!d || !tm || !where) return null;
    const local = { year: +d[1]!, month: +d[2]!, day: +d[3]!, hour: +tm[1]!, minute: +tm[2]! };
    const h12 = ((local.hour + 11) % 12) + 1;
    const whenText = `${local.day} ${MONTHS[local.month - 1]} ${local.year}, ${h12}:${pad(local.minute)} ${local.hour < 12 ? 'am' : 'pm'}`;
    if (!where.zone) {
      const z = new Date(0);
      z.setUTCFullYear(local.year, local.month - 1, local.day);
      z.setUTCHours(local.hour, local.minute, 0, 0);
      return { t: fromUnixMs(z.getTime()), offset: 0, gap: undefined as 'gap' | 'twice' | undefined, whenText, noTime };
    }
    const r = localToUtc(local, where.zone);
    return { t: fromUnixMs(r.utcMs), offset: r.offset, gap: r.note, whenText, noTime };
  }, [date, time, where]);

  const reading: Reading | null = useMemo(() => (moment && where ? readingAt(moment.t, where.lat, where.lon, system) : null), [moment, where, system]);
  const coordsText = where ? `${formatLat(where.lat * DEG, 0)} · ${formatLon(where.lon * DEG, 0)}` : '';
  const path = (): Path | null => {
    const base = actions.base();
    if (!reading || !moment || !where || !base) return null;
    return starsignsPath(reading, {
      id: `starsigns-${Date.now().toString(36)}`,
      created: new Date().toISOString(),
      placeLabel: where.label,
      placeName: where.name,
      whenText: moment.whenText,
      system,
      noTime: moment.noTime,
      ...(where.zone ? { zone: moment.offset } : {}),
      look: base.look,
      calendar: base.calendar,
    });
  };
  const soundtrack = (): Soundtrack | null =>
    track === 'hum' ? null : track === 'file' ? (file ? { kind: 'file', data: file.data, name: file.name } : null) : { kind: 'mood', mood: track };
  const listen = (): void => {
    if (listening) {
      stopSoundtrack(0.4);
      setListening(false);
      return;
    }
    const t = soundtrack();
    if (!t) return;
    setTrackError('');
    setListening(true);
    playSoundtrack(t, 0.5).catch(() => {
      setListening(false);
      setTrackError('That file could not be played: try an MP3, M4A or WAV.');
    });
  };
  const goNow = (): void => {
    const p = path();
    if (!p) return;
    stopSoundtrack(0.2);
    setListening(false);
    const gift: Gift | undefined =
      GIFT_MODE && (heading.trim() || message.trim() || track !== 'hum')
        ? {
            heading: heading.trim(),
            message: message.trim(),
            sub: `${moment?.whenText ?? ''}${where ? ` · ${where.name}` : ''}`,
            soundtrack: soundtrack(),
            ...(where
              ? {
                  sky: {
                    date,
                    time: moment?.noTime ? null : time.slice(0, 5),
                    lat: where.lat,
                    lon: where.lon,
                    zone: where.zone,
                    place: where.name,
                    system,
                    ...(heading.trim() ? { heading: heading.trim() } : {}),
                  },
                }
              : {}),
          }
        : undefined;
    actions.go(p, gift);
  };
  const choose = (p: Place): void => fromPlace(p, 'chosen');
  const coordsChanged = (lt: string, ln: string): void => {
    const a = parseCoordinate(lt, 'lat'), b = parseCoordinate(ln, 'lon');
    if (a !== null && b !== null) fromCoords(a, b);
  };

  return (
    <div className="path-dialog-backdrop" data-no-capture onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="path-dialog astro-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="astro-title"
        onSubmit={(e) => {
          e.preventDefault();
          goNow();
        }}
      >
        <button type="button" className="astro-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
          ×
        </button>
        <h2 id="astro-title">✶ Starsigns</h2>

        <div className="row astro-when">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min="1800-01-01" max="2200-12-31" required />
          </label>
          <label>
            Local time <span className="hint">(blank: noon)</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>

        <div className="astro-place">
          <label htmlFor="astro-place-input">Place</label>
          <input
            id="astro-place-input"
            type="text"
            role="combobox"
            value={query}
            placeholder="Start typing a place"
            autoComplete="off"
            aria-autocomplete="list"
            aria-expanded={matches.length > 0}
            aria-controls="astro-places"
            aria-activedescendant={matches.length ? `astro-opt-${active}` : undefined}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (!matches.length) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length);
              } else if (e.key === 'Enter' || e.key === 'Tab') {
                // Like a transit app: Enter or Tab takes the highlighted place (Tab then moves on).
                if (e.key === 'Enter') e.preventDefault();
                choose(matches[active] ?? matches[0]!);
              }
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {matches.length > 0 && (
            <ul className="astro-places" id="astro-places" role="listbox" aria-label="Places">
              {matches.map((p, i) => (
                <li
                  key={`${p.name}|${p.region}|${p.lat}`}
                  id={`astro-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    choose(p);
                  }}
                  onPointerEnter={() => setActive(i)}
                >
                  <b>{p.name}</b>
                  <span>{[p.region !== p.name ? p.region : '', p.country].filter(Boolean).join(', ')}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="row astro-coords">
            <label>
              Lat
              <input
                type="text"
                inputMode="decimal"
                value={latText}
                placeholder="49.883 or 49°52′59″N"
                onChange={(e) => {
                  setLatText(e.target.value);
                  coordsChanged(e.target.value, lonText);
                }}
              />
            </label>
            <label>
              Lon
              <input
                type="text"
                inputMode="decimal"
                value={lonText}
                placeholder="−97.166 or 97°09′58″W"
                onChange={(e) => {
                  setLonText(e.target.value);
                  coordsChanged(latText, e.target.value);
                }}
              />
            </label>
            <button
              type="button"
              className="astro-here"
              title="Use this device’s location (it asks first)"
              aria-label="Use this device’s location"
              onClick={() => {
                if (!navigator.geolocation) return setNote('This device does not share its location.');
                setNote('Finding where you are…');
                navigator.geolocation.getCurrentPosition(
                  (pos) => {
                    const { latitude: a, longitude: b } = pos.coords;
                    setLatText(fmt(a));
                    setLonText(fmt(b));
                    fromCoords(a, b);
                    setNote('');
                  },
                  () => setNote('Location not shared; type a place instead.'),
                  { maximumAge: 600_000, timeout: 10_000 },
                );
              }}
            >
              ⌖
            </button>
          </div>
          {where && (
            <p className="note">
              {where.zone ? where.zone : 'No time zone known here: the time is taken as UTC'}
              {moment && where.zone ? ` (${formatOffset(moment.offset)} on that date)` : ''}
              {moment?.gap === 'gap' && ' · that clock time was skipped (clocks went forward); taken as before the change'}
              {moment?.gap === 'twice' && ' · that clock time happened twice (clocks went back); the first is taken'}
              {note && ` · ${note}`}
            </p>
          )}
        </div>

        {/* Return in any box flies it, as ▶ Go does. */}
        <button type="submit" className="visually-hidden" tabIndex={-1} disabled={!reading}>
          Go
        </button>
        {/* No explanations or tables here (owner, 3 Nov 2026): the path shows the signs and houses
            in the sky, and the package's PDF prints them. */}
        <label className="astro-system row">
          Houses
          <select value={system} onChange={(e) => setSystem(e.target.value as HouseSystem)} title="Whole Sign: each house is one whole sign, from the sign rising in the east. Equal: twelve 30° houses from the exact rising degree.">
            {HOUSE_SYSTEMS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
          {moment?.noTime && <span className="hint">No time given: noon is used, so the houses are only a guide.</span>}
        </label>

        {GIFT_MODE && (
          <fieldset className="astro-gift">
            <legend>🎁 Gift edition</legend>
            <label>
              Heading <span className="hint">(the first thing on screen)</span>
              <input value={heading} maxLength={60} placeholder="Happy birthday, Sarah!" onChange={(e) => setHeading(e.target.value)} />
            </label>
            <label>
              Message <span className="hint">({160 - message.length} left)</span>
              <textarea value={message} maxLength={160} rows={2} placeholder="The sky the moment you arrived. Love, Mom" onChange={(e) => setMessage(e.target.value)} />
            </label>
            <div className="row astro-track">
              <label>
                Soundtrack
                <select
                  value={track}
                  onChange={(e) => {
                    stopSoundtrack(0.3);
                    setListening(false);
                    setTrack(e.target.value as typeof track);
                  }}
                >
                  <option value="hum">Sky hum (as free)</option>
                  {MOODS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                  <option value="file">Their own song (a file)…</option>
                </select>
              </label>
              {track === 'file' && (
                <input
                  type="file"
                  accept="audio/*"
                  aria-label="The song to play"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setTrackError('');
                    if (f) void f.arrayBuffer().then((data) => setFile({ data, name: f.name }));
                  }}
                />
              )}
              <button type="button" className="listen" disabled={!soundtrack()} onClick={listen} title="Hear it">
                {listening ? '■ Stop' : '♪ Listen'}
              </button>
            </div>
            {trackError && <p className="note">{trackError}</p>}
            <p className="hint">The heading and message show for the first 6 seconds of the video; the song plays under the whole tour and fades out at the end. Use only music the customer owns or may use.</p>
          </fieldset>
        )}

        {/* One button (owner, 4 Nov 2026): ▶ Go saves the path (listed in ▷ Paths), flies it and
            records it; the Download package (video, PDF, path token, ✶ Customize, ☕) pops up at the end. */}
        <div className="row astro-go">
          <button type="button" className="go-big" disabled={!reading} onClick={goNow} title="Fly your sky and record it (an MP4 made for X); at the end, the Download package">
            <span aria-hidden="true">▶</span> Go
          </button>
        </div>
      </form>
    </div>
  );
}
