import { useEffect, useMemo, useRef, useState } from 'react';
import { HOUSE_SYSTEMS, type HouseSystem } from '../core/houses';
import type { Path, PathPoint } from '../core/path';
import { nearestPlace, parseCoordinate, parsePlaces, type Place, placeForZone, placeLabel, searchPlaces } from '../core/places';
import { readingAt, type Reading } from '../core/reading';
import { formatLat, formatLon } from '../core/spheres';
import { starsignsPath } from '../core/starsigns';
import { starsignsCard } from '../core/starsignsPdf';
import { fromUnixMs } from '../core/time';
import { COFFEE_URL, saveBytes, SHOP_OPEN, shopLink } from './shop';
import { formatOffset, localToUtc } from './zones';
import { getVideoSize, setVideoSize, type VideoSize } from './capture';

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

/** What the page gives the dialog. */
export interface StarsignsActions {
  /** The look and calendar now, for the path to start from. */
  base: () => PathPoint | null;
  /** Save the path and play it (free); with `capture`, record it as a video (◉ Record, watermarked). */
  play: (path: Path, capture: boolean) => void;
  /** Save the path as a .sp4ce.json file (free). */
  download: (path: Path) => void;
  /** ✶ Create Path: save it and list it in ▷ Present, ready to run. */
  create: (path: Path) => void;
  /** The package: fly and record the path, then one .zip with the PDF, the video and the path token. */
  pack: (path: Path, pdf: Uint8Array, size: VideoSize, base: string) => void;
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
 * ▶ Go (tap) flies the path; holding it offers ◉ Record (the video, stopping by itself at the end; its running time and ■ Stop at the bottom of the screen). The video, the card's inside (PDF) and the path are free; ✶ Customize goes to
 * sp4cetime.store (occasions, names, artwork). No prices on this site. Never in a capture.
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
  // The package's PDF is one 8.5 × 11 in page, landscape (owner, 3 Nov 2026).
  const paper = 'letter' as const;
  const [size, setSize] = useState<VideoSize>(getVideoSize);
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const listOpen = useRef(false);

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
  /** The card's inside, one page, free. */
  const card = (): Uint8Array | null =>
    reading && moment && where
      ? starsignsCard(reading, {
          paper,
          preview: false,
          sides: 'inside',
          whenText: `${moment.whenText}${moment.noTime ? ' (no time given: noon)' : ` (${where.zone ? formatOffset(moment.offset) : 'UTC'})`}`,
          placeLabel: where.label,
          coordsText,
          systemName: HOUSE_SYSTEMS.find((h) => h.id === system)!.name,
        })
      : null;
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
      look: base.look,
      calendar: base.calendar,
    });
  };
  const fileBase = `starsigns-${date}`;
  const go = (capture: boolean): void => {
    const p = path();
    if (p) actions.play(p, capture);
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
          const p = path();
          if (p) actions.create(p);
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
        {/* ✶ Create Path (owner, 3 Nov 2026; it was ▶ Go): the path is saved and opens in ▷ Present,
            where its Present button runs it. */}
        <div className="row astro-go">
          <button
            type="button"
            className="go-big"
            disabled={!reading}
            onClick={() => {
              const p = path();
              if (p) actions.create(p);
            }}
            title="Make the path of this sky: it opens in ▷ Present, ready to run"
          >
            <span aria-hidden="true">✶</span> Create Path
          </button>
        </div>

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

        {/* Two buttons (owner, 3 Nov 2026): the package (the PDF, 8.5 × 11 in landscape; the video,
            hi-res or small; the path token) and a coffee. */}
        <div className="row astro-files">
          <button
            type="button"
            className="primary"
            disabled={!reading}
            onClick={() => {
              const p = path();
              const b = card();
              if (p && b) actions.pack(p, b, size, fileBase);
            }}
            title="Flies your sky while recording it, then downloads one .zip: the PDF (8.5 × 11 in, landscape), the video (.mp4) and the path token (.json)"
          >
            ⤓ Download package
          </button>
          <select
            value={size}
            onChange={(e) => {
              const v = e.target.value as VideoSize;
              setSize(v);
              setVideoSize(v);
            }}
            aria-label="Video size"
            title="Hi-res for desktop screens (up to 4K), or for X (1080p, 30 frames a second, with sound: made to X's rules)"
          >
            <option value="hires">Video: hi-res</option>
            <option value="small">Video: for X (1080p)</option>
          </select>
          <Coffee />
        </div>
      </form>
    </div>
  );
}

/** "☕ Buy me a coffee": a Stripe Payment Link, any amount (owner, 3 Nov 2026: always shown; until the live link is set, it says so). */
function Coffee() {
  if (!COFFEE_URL)
    return (
      <span className="coffee coffee-soon" role="link" aria-disabled="true" title="Coming soon: pay what you like, through Stripe">
        ☕ Buy me a coffee
      </span>
    );
  return (
    <a className="coffee" href={COFFEE_URL} target="_blank" rel="noopener" title="Pay what you like, through Stripe: it keeps sp4cetime going">
      ☕ Buy me a coffee
    </a>
  );
}
