import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSignDeg, HOUSE_SYSTEMS, houseLabel, houseOf, type HouseSystem } from '../core/houses';
import type { Path, PathPoint } from '../core/path';
import { nearestPlace, parseCoordinate, parsePlaces, type Place, placeForZone, placeLabel, searchPlaces } from '../core/places';
import { readingAt, type Reading } from '../core/reading';
import { formatLat, formatLon } from '../core/spheres';
import { starsignsPath } from '../core/starsigns';
import { starsignsCard } from '../core/starsignsPdf';
import { fromUnixMs } from '../core/time';
import { PRICE, SHOP_OPEN, shopLink, UNLOCKED, viewPdf } from './shop';
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

/** What the page gives the dialog. */
export interface StarsignsActions {
  /** The look and calendar now, for the path to start from. */
  base: () => PathPoint | null;
  /** Save the path and play it (free); with `capture`, record it as a video (◉ Capture, watermarked). */
  play: (path: Path, capture: boolean) => void;
  /** Save the path as a .sp4ce.json file (free). */
  download: (path: Path) => void;
  /** The paid package, made here (development only until the shop opens). */
  makePackage: (path: Path, pdf: Uint8Array, fileBase: string) => void;
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
 * Personalising (a name, artwork) and the clean files are on sp4cetime.shop. Never in a capture.
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
  const [paper, setPaper] = useState<'letter' | 'a4'>(() => (/^en-(US|CA)$/.test(navigator.language) ? 'letter' : 'a4'));
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [note, setNote] = useState('');
  const goRef = useRef<HTMLButtonElement>(null);
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
    goRef.current?.focus();
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
  const card = (preview: boolean): Uint8Array | null =>
    reading && moment && where
      ? starsignsCard(reading, {
          paper,
          preview,
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
          go(false);
        }}
      >
        <button type="button" className="astro-x" onClick={onClose} aria-label="Close (Esc)" title="Close (Esc)">
          ×
        </button>
        <h2 id="astro-title">✶ Starsigns</h2>
        <p className="note">The sky for a moment and a place: the planets in their signs, and the twelve houses around that spot. It starts at now and here.</p>

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

        <div className="row astro-go">
          <button ref={goRef} type="submit" className="primary go" disabled={!reading}>
            ▷ Go
          </button>
          <button type="button" disabled={!reading} onClick={() => go(true)} title="Fly the path and record it as a video (◉ Capture, with the @sp4cetime.org mark)">
            ▷ Go + ◉ Capture
          </button>
        </div>

        {reading && (
          <details className="astro-pdf" open>
            <summary>Signs and houses</summary>
            <table className="astro-table">
              <thead>
                <tr>
                  <th scope="col">Body</th>
                  <th scope="col">Sign</th>
                  <th scope="col">House</th>
                </tr>
              </thead>
              <tbody>
                {reading.bodies.map((b) => (
                  <tr key={b.id}>
                    <th scope="row">{b.name}</th>
                    <td>
                      {b.sign.glyph} {formatSignDeg(b.lon)}
                      {b.retrograde && <span className="rx" title="Retrograde: seen from Earth, moving backward along the zodiac"> ℞</span>}
                    </td>
                    <td>{houseLabel(b.house)}</td>
                  </tr>
                ))}
                <tr className="angle">
                  <th scope="row">Ascendant</th>
                  <td>{formatSignDeg(reading.chart.asc)}</td>
                  <td>{houseLabel(1)}</td>
                </tr>
                <tr className="angle">
                  <th scope="row">Midheaven</th>
                  <td>{formatSignDeg(reading.chart.mc)}</td>
                  <td>{houseLabel(houseOf(reading.chart.mc, reading.chart.cusps))}</td>
                </tr>
              </tbody>
            </table>
            <label className="astro-system">
              Houses
              <select value={system} onChange={(e) => setSystem(e.target.value as HouseSystem)}>
                {HOUSE_SYSTEMS.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
              <span className="hint">
                {system === 'whole'
                  ? 'Whole Sign: each house is one whole sign, starting with the sign rising in the east.'
                  : 'Equal: twelve 30° houses, starting at the exact rising degree.'}
              </span>
            </label>
            <p className="note">
              Positions are astronomy; houses and their meanings are astrology. Signs are counted from the equinox of that date.
              {moment?.noTime && ' No time given, so noon is used: the houses (and maybe the Moon’s sign) need the birth time.'}
            </p>
          </details>
        )}

        {reading && (
          <div className="row astro-files">
            <button
              type="button"
              onClick={() => {
                const p = path();
                if (p) actions.download(p);
              }}
              title="The path as a small .sp4ce.json file: anyone can play it at sp4cetime.org (⤒ Upload in the Present menu)"
            >
              ⤓ The path (.json)
            </button>
            <button
              type="button"
              onClick={() => {
                const b = card(true);
                if (b) viewPdf(b, `${fileBase}-card-preview.pdf`);
              }}
              title="A folding birthday card: print both sides, fold in half"
            >
              Preview the card (PDF)
            </button>
            <select value={paper} onChange={(e) => setPaper(e.target.value as 'letter' | 'a4')} aria-label="Paper">
              <option value="letter">5 × 7 in card (Letter)</option>
              <option value="a4">A6 card (A4)</option>
            </select>
          </div>
        )}

        {reading && (
          <div className="astro-buy">
            <button
              type="button"
              className="primary"
              disabled={!SHOP_OPEN && !UNLOCKED}
              onClick={() => {
                const p = path();
                const b = card(false);
                if (!p || !b || !where) return;
                if (UNLOCKED) return actions.makePackage(p, b, fileBase);
                window.open(
                  shopLink({
                    date,
                    time: moment?.noTime ? null : time,
                    place: { label: where.label, name: where.name, lat: where.lat, lon: where.lon, zone: where.zone },
                    name: '',
                    system,
                    pdf: { title: 'Starsigns', paper, style: 'paper' },
                  }),
                  '_blank',
                  'noopener',
                );
              }}
            >
              ✶ Personalise and download · {PRICE}
            </button>
            <span className="note">
              {UNLOCKED
                ? 'Development: the package is made here without paying (the video, then the clean card).'
                : SHOP_OPEN
                  ? 'On sp4cetime.shop: add a name and artwork, then download the video, the card and the pictures. Your details travel in the link only.'
                  : 'On sp4cetime.shop, opening soon: a name and artwork, the clean video, card and pictures.'}
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
