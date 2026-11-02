import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSignDeg, HOUSE_SYSTEMS, houseOf, type HouseSystem } from '../core/houses';
import type { Path, PathPoint } from '../core/path';
import { parseLatLon, parsePlaces, type Place, placeLabel, searchPlaces } from '../core/places';
import { readingAt, type Reading } from '../core/reading';
import { formatLat, formatLon } from '../core/spheres';
import { starsignsPath } from '../core/starsigns';
import { starsignsPdf } from '../core/starsignsPdf';
import { fromUnixMs, type Time } from '../core/time';
import { PRICE, saveBytes, SHOP_OPEN, shopLink, UNLOCKED, viewPdf } from './shop';
import { formatOffset, localToUtc } from './zones';

const DEG = Math.PI / 180;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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
  /** IANA zone, or null for typed coordinates (the time is then taken as UTC). */
  readonly zone: string | null;
}

/** What the page gives the dialog: what is on screen (to start the path from) and what to do with the results. */
export interface StarsignsActions {
  /** The look and calendar now, for the path to start from. */
  base: () => PathPoint | null;
  /** Save the path and play it (free). */
  play: (path: Path) => void;
  /** Record the path as a video and save the PDF (the paid package). */
  makePackage: (path: Path, pdf: Uint8Array, fileBase: string) => void;
  /** Take the map to that moment. */
  go: (t: Time) => void;
}

/**
 * ✶ Starsigns (0.4.0, ADR-0018): a date, a time and a place → every body's sign and
 * house, a free path to play (signs from above, houses from the place), a PDF preview, and
 * the video and PDF to download (US$1.99 on sp4cetime.shop). Never in a capture.
 */
export function StarsignsDialog({ onClose, actions }: { onClose: () => void; actions: StarsignsActions }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('12:00');
  const [noTime, setNoTime] = useState(false);
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<Where | null>(null);
  const [system, setSystem] = useState<HouseSystem>('whole');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('Starsigns');
  const [paper, setPaper] = useState<'letter' | 'a4'>(() => (/^en-(US|CA)$/.test(navigator.language) ? 'letter' : 'a4'));
  const [style, setStyle] = useState<'paper' | 'night'>('paper');
  const [places, setPlaces] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    void loadPlaces(import.meta.env.BASE_URL).then(setPlaces);
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);

  const typed = useMemo(() => parseLatLon(query), [query]);
  const matches = useMemo(() => (typed || !open ? [] : searchPlaces(places, query, 6)), [places, query, typed, open]);
  const choose = (p: Place): void => {
    setWhere({ label: placeLabel(p), name: p.name, lat: p.lat, lon: p.lon, zone: p.zone });
    setQuery(placeLabel(p));
    setOpen(false);
  };

  // The moment: local clock time in the place's zone → UTC.
  const moment = useMemo(() => {
    const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const tm = (noTime ? '12:00' : time).match(/^(\d{1,2}):(\d{2})/);
    if (!d || !tm || !where) return null;
    const local = { year: +d[1]!, month: +d[2]!, day: +d[3]!, hour: +tm[1]!, minute: +tm[2]! };
    const h12 = ((local.hour + 11) % 12) + 1;
    const whenText = `${local.day} ${MONTHS[local.month - 1]} ${local.year}${noTime ? '' : `, ${h12}:${String(local.minute).padStart(2, '0')} ${local.hour < 12 ? 'am' : 'pm'}`}`;
    if (!where.zone) {
      const z = new Date(0);
      z.setUTCFullYear(local.year, local.month - 1, local.day);
      z.setUTCHours(local.hour, local.minute, 0, 0);
      return { t: fromUnixMs(z.getTime()), offset: 0, note: undefined as 'gap' | 'twice' | undefined, whenText };
    }
    const r = localToUtc(local, where.zone);
    return { t: fromUnixMs(r.utcMs), offset: r.offset, note: r.note, whenText };
  }, [date, time, noTime, where]);

  const reading: Reading | null = useMemo(() => (moment && where ? readingAt(moment.t, where.lat, where.lon, system) : null), [moment, where, system]);

  const coordsText = where ? `${formatLat(where.lat * DEG, 0)} · ${formatLon(where.lon * DEG, 0)}` : '';
  const sheet = (preview: boolean): Uint8Array | null =>
    reading && moment && where
      ? starsignsPdf(reading, {
          title: title.trim() || 'Starsigns',
          ...(name.trim() && { name: name.trim() }),
          paper,
          style,
          preview,
          whenText: noTime ? moment.whenText : `${moment.whenText} (${where.zone ? formatOffset(moment.offset) : 'UTC'})`,
          placeLabel: where.label,
          coordsText,
          systemName: HOUSE_SYSTEMS.find((h) => h.id === system)!.name,
          noTime,
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
      ...(name.trim() && { name: name.trim() }),
      system,
      noTime,
      look: base.look,
      calendar: base.calendar,
    });
  };
  const fileBase = `starsigns-${date}${name.trim() ? `-${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : ''}`;

  return (
    <div className="path-dialog-backdrop" data-no-capture onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="path-dialog astro-dialog" role="dialog" aria-modal="true" aria-labelledby="astro-title" onSubmit={(e) => e.preventDefault()}>
        <h2 id="astro-title">✶ Starsigns</h2>
        <p className="note">Where the Sun, the Moon and the planets were for a moment and a place, as a path through the sky to play, and a sheet to print. Positions are astronomy; houses and their meanings are astrology.</p>

        <div className="row astro-when">
          <label>
            Date
            <input ref={first} type="date" value={date} onChange={(e) => setDate(e.target.value)} min="1800-01-01" max="2200-12-31" required />
          </label>
          <label>
            Local time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={noTime} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={noTime} onChange={(e) => setNoTime(e.target.checked)} />
          I don’t know the time (noon is used: signs only, no houses)
        </label>

        <label className="astro-place">
          Place (a town, or latitude and longitude)
          <input
            type="text"
            value={query}
            placeholder="Winnipeg · or 49°52′59″N 97°09′58″W"
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value;
              setQuery(v);
              setOpen(true);
              const c = parseLatLon(v);
              setWhere(c ? { label: `${formatLat(c.lat * DEG, 0)} · ${formatLon(c.lon * DEG, 0)}`, name: 'this place', lat: c.lat, lon: c.lon, zone: null } : null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches[0]) {
                e.preventDefault();
                choose(matches[0]);
              }
            }}
            aria-autocomplete="list"
            aria-controls="astro-places"
          />
        </label>
        {matches.length > 0 && (
          <ul className="astro-places" id="astro-places" role="listbox">
            {matches.map((p) => (
              <li key={`${p.name}|${p.region}|${p.lat}`}>
                <button type="button" role="option" aria-selected={false} onClick={() => choose(p)}>
                  {placeLabel(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {where && (
          <p className="note">
            {where.zone ? 'Taken at the centre of town: ' : 'Exactly here: '}
            {coordsText}
            {where.zone ? <> · {where.zone}{moment ? ` (${formatOffset(moment.offset)} on that date)` : ''}</> : ' · the time is taken as UTC'}
            {moment?.note === 'gap' && ' · that clock time was skipped (clocks went forward); taken as before the change'}
            {moment?.note === 'twice' && ' · that clock time happened twice (clocks went back); the first is taken'}
          </p>
        )}

        <div className="row astro-when">
          <label>
            Name (optional)
            <input type="text" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Whose sky" />
          </label>
          <label className="astro-system">
            Houses
            <select value={system} onChange={(e) => setSystem(e.target.value as HouseSystem)} disabled={noTime}>
              {HOUSE_SYSTEMS.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {reading && (
          <>
            <table className="astro-table">
              <thead>
                <tr>
                  <th scope="col">Body</th>
                  <th scope="col">Sign</th>
                  {!noTime && <th scope="col">House</th>}
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
                    {!noTime && <td>{b.house}</td>}
                  </tr>
                ))}
                {!noTime && (
                  <>
                    <tr className="angle">
                      <th scope="row">Ascendant</th>
                      <td>{formatSignDeg(reading.chart.asc)}</td>
                      <td>1</td>
                    </tr>
                    <tr className="angle">
                      <th scope="row">Midheaven (MC)</th>
                      <td>{formatSignDeg(reading.chart.mc)}</td>
                      <td>{houseOf(reading.chart.mc, reading.chart.cusps)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
            <p className="note">
              Signs are tropical, counted from the equinox of that date. They sit about 24° from the constellations of the same names.
              {noTime && ' Without a time, the Moon may be in the next or previous sign.'}
              {!noTime && ' The Moon is shown from Earth’s centre; seen from the place itself it can differ by up to about 1°.'}
              {reading.chart.polar && !noTime && ' Inside a polar circle the houses are unusual: the ecliptic can run along the horizon.'}
            </p>

            <div className="row">
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const p = path();
                  if (p) actions.play(p);
                }}
              >
                ▷ Play my Starsigns path
              </button>
              <button type="button" onClick={() => moment && actions.go(moment.t)}>
                Go to this moment
              </button>
            </div>

            <details className="astro-pdf">
              <summary>The printable sheet (PDF)</summary>
              <div className="row astro-when">
                <label>
                  Title
                  <input type="text" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <label>
                  Paper
                  <select value={paper} onChange={(e) => setPaper(e.target.value as 'letter' | 'a4')}>
                    <option value="letter">Letter</option>
                    <option value="a4">A4</option>
                  </select>
                </label>
                <label>
                  Colours
                  <select value={style} onChange={(e) => setStyle(e.target.value as 'paper' | 'night')}>
                    <option value="paper">Paper (prints well)</option>
                    <option value="night">Night</option>
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  const b = sheet(true);
                  if (b) viewPdf(b, `${fileBase}-preview.pdf`);
                }}
              >
                Preview the PDF
              </button>
            </details>

            <div className="astro-buy">
              <button
                type="button"
                className="primary"
                disabled={!SHOP_OPEN && !UNLOCKED}
                onClick={() => {
                  const p = path();
                  const b = sheet(false);
                  if (!p || !b || !where) return;
                  if (UNLOCKED) {
                    actions.makePackage(p, b, fileBase);
                    return;
                  }
                  window.open(
                    shopLink({
                      date,
                      time: noTime ? null : time,
                      place: { label: where.label, name: where.name, lat: where.lat, lon: where.lon, zone: where.zone },
                      name: name.trim(),
                      system,
                      pdf: { title: title.trim() || 'Starsigns', paper, style },
                    }),
                    '_blank',
                    'noopener',
                  );
                }}
              >
                ⤓ Get the video and the PDF · {PRICE}
              </button>
              <span className="note">
                {UNLOCKED
                  ? 'Development: made here without paying. The video records the path as it plays (about 30 seconds), then the PDF saves.'
                  : SHOP_OPEN
                    ? 'On sp4cetime.shop. Your details travel in the link only, never to a server.'
                    : 'The shop opens soon. Until then, play the path for free, or record it yourself with ◉ Capture.'}
              </span>
            </div>
          </>
        )}
        <div className="row">
          <button type="button" onClick={onClose}>
            Close <kbd>Esc</kbd>
          </button>
        </div>
      </form>
    </div>
  );
}
