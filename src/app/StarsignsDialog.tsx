import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSignDeg, HOUSE_SYSTEMS, houseOf, type HouseSystem } from '../core/houses';
import { parseLatLon, parsePlaces, type Place, placeLabel, searchPlaces } from '../core/places';
import { readingAt } from '../core/reading';
import { formatLat, formatLon } from '../core/spheres';
import { fromUnixMs, type Time } from '../core/time';
import { formatOffset, localToUtc } from './zones';

const DEG = Math.PI / 180;

/** The place list is loaded once, the first time the dialog opens (about 180 KB). */
let placesPromise: Promise<Place[]> | null = null;
const loadPlaces = (base: string): Promise<Place[]> =>
  (placesPromise ??= fetch(`${base}places.json`)
    .then((r) => (r.ok ? r.json() : null))
    .then(parsePlaces)
    .catch(() => []));

interface Where {
  readonly label: string;
  readonly lat: number;
  readonly lon: number;
  /** IANA zone, or null for typed coordinates (then the time is taken as UTC unless a zone is picked). */
  readonly zone: string | null;
}

/**
 * ✶ Astrology (0.4.0, ADR-0018): a date, a time and a place → every body's sign and house.
 * A town is taken at its centre. This is the free preview's first part (the table); the
 * video and the printable PDF follow. Never in a capture.
 */
export function AstrologyDialog({ onClose, onGo }: { onClose: () => void; onGo: (t: Time) => void }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('12:00');
  const [noTime, setNoTime] = useState(false);
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<Where | null>(null);
  const [system, setSystem] = useState<HouseSystem>('whole');
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
    setWhere({ label: placeLabel(p), lat: p.lat, lon: p.lon, zone: p.zone });
    setQuery(placeLabel(p));
    setOpen(false);
  };

  // The moment: local clock time in the place's zone → UTC.
  const moment = useMemo(() => {
    const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const tm = (noTime ? '12:00' : time).match(/^(\d{1,2}):(\d{2})/);
    if (!d || !tm || !where) return null;
    const local = { year: +d[1]!, month: +d[2]!, day: +d[3]!, hour: +tm[1]!, minute: +tm[2]! };
    if (!where.zone) {
      const z = new Date(0);
      z.setUTCFullYear(local.year, local.month - 1, local.day);
      z.setUTCHours(local.hour, local.minute, 0, 0);
      return { t: fromUnixMs(z.getTime()), offset: 0, note: undefined as 'gap' | 'twice' | undefined };
    }
    const r = localToUtc(local, where.zone);
    return { t: fromUnixMs(r.utcMs), offset: r.offset, note: r.note };
  }, [date, time, noTime, where]);

  const reading = useMemo(() => (moment && where ? readingAt(moment.t, where.lat, where.lon, system) : null), [moment, where, system]);

  return (
    <div className="path-dialog-backdrop" data-no-capture onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="path-dialog astro-dialog" role="dialog" aria-modal="true" aria-labelledby="astro-title" onSubmit={(e) => e.preventDefault()}>
        <h2 id="astro-title">✶ Your sky: signs and houses</h2>
        <p className="note">Where the Sun, the Moon and the planets were for a moment and a place. Positions are astronomy; houses and their meanings are astrology.</p>

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
              setWhere(c ? { label: `${formatLat(c.lat * DEG, 0)} · ${formatLon(c.lon * DEG, 0)}`, lat: c.lat, lon: c.lon, zone: null } : null);
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
            {formatLat(where.lat * DEG, 0)} · {formatLon(where.lon * DEG, 0)}
            {where.zone ? <> · {where.zone}{moment ? ` (${formatOffset(moment.offset)} on that date)` : ''}</> : ' · the time is taken as UTC'}
            {moment?.note === 'gap' && ' · that clock time was skipped (clocks went forward); taken as before the change'}
            {moment?.note === 'twice' && ' · that clock time happened twice (clocks went back); the first is taken'}
          </p>
        )}

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
              <button type="button" className="primary" onClick={() => moment && onGo(moment.t)}>
                Go to this moment
              </button>
              <span className="note astro-soon">Coming next: the video (signs from above, houses from the place) and a printable PDF.</span>
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
