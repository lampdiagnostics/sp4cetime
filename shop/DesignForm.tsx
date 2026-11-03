/**
 * The design a buyer makes: occasion, names, message, the moment (date, time) and the place
 * (a town, with its time zone, from public places.json, like the Starsigns dialog on
 * sp4cetime.org). Produces a catalog Design, or null while something is missing.
 */

import { useEffect, useMemo, useState } from 'react';
import { type Design, LIMITS, type Occasion, OCCASIONS } from '../src/core/catalog';
import { HOUSE_SYSTEMS, type HouseSystem } from '../src/core/houses';
import { parsePlaces, type Place, placeForZone, placeLabel, searchPlaces } from '../src/core/places';
import { fromUnixMs } from '../src/core/time';
import { formatOffset, localToUtc } from '../src/app/zones';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n: number): string => String(n).padStart(2, '0');

let placesPromise: Promise<Place[]> | null = null;
export const loadPlaces = (): Promise<Place[]> =>
  (placesPromise ??= fetch('/places.json')
    .then((r) => (r.ok ? r.json() : null))
    .then(parsePlaces)
    .catch(() => []));

export interface FormState {
  occasion: Occasion;
  names: string;
  message: string;
  date: string;
  time: string;
  place: { label: string; lat: number; lon: number; zone: string } | null;
  system: HouseSystem;
  paper: 'letter' | 'a4';
  style: 'paper' | 'night';
  start: string;
}

export function emptyForm(): FormState {
  const d = new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return {
    occasion: 'birthday',
    names: '',
    message: '',
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
    place: null,
    system: 'whole',
    paper: /^en-(US|CA)$/.test(navigator.language) ? 'letter' : 'a4',
    style: 'night',
    start: `${next.getFullYear()}-${pad(next.getMonth() + 1)}`,
  };
}

/** A form from a design (the link from sp4cetime.org, or an item in the cart). Date and time are rebuilt from the words. */
export function formFromDesign(d: Design, zone: string | null, local: { date: string; time: string } | null): FormState {
  const f = emptyForm();
  return {
    ...f,
    occasion: d.occasion,
    names: d.names,
    message: d.message,
    ...(local ?? {}),
    ...(d.noTime ? { time: '' } : {}),
    place: { label: d.place, lat: d.lat, lon: d.lon, zone: zone ?? 'UTC' },
    system: d.system,
    paper: d.paper,
    style: d.style,
    start: d.start ?? f.start,
  };
}

export function designOf(f: FormState): Design | null {
  const dm = f.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const noTime = !/^\d{1,2}:\d{2}/.test(f.time);
  const tm = (noTime ? '12:00' : f.time).match(/^(\d{1,2}):(\d{2})/);
  if (!dm || !tm || !f.place) return null;
  const local = { year: +dm[1]!, month: +dm[2]!, day: +dm[3]!, hour: +tm[1]!, minute: +tm[2]! };
  const r = localToUtc(local, f.place.zone);
  const t = fromUnixMs(r.utcMs);
  const h12 = ((local.hour + 11) % 12) + 1;
  const when = `${local.day} ${MONTHS[local.month - 1]} ${local.year}${noTime ? '' : `, ${h12}:${pad(local.minute)} ${local.hour < 12 ? 'am' : 'pm'} (${formatOffset(r.offset)})`}`;
  return {
    occasion: f.occasion,
    names: f.names.trim(),
    message: f.message.trim(),
    day: t.day,
    sec: t.sec,
    when,
    noTime,
    place: f.place.label,
    lat: f.place.lat,
    lon: f.place.lon,
    system: f.system,
    paper: f.paper,
    style: f.style,
    start: f.start,
  };
}

export function DesignForm({ value, onChange, show }: { value: FormState; onChange: (f: FormState) => void; show: { message?: boolean; calendar?: boolean; paper?: boolean; style?: boolean; occasion?: boolean } }) {
  const [places, setPlaces] = useState<Place[]>([]);
  const [query, setQuery] = useState(value.place?.label ?? '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void => onChange({ ...value, [k]: v });

  useEffect(() => {
    void loadPlaces().then((list) => {
      setPlaces(list);
      if (!value.place) {
        const p = placeForZone(list, Intl.DateTimeFormat().resolvedOptions().timeZone);
        if (p) {
          onChange({ ...value, place: { label: placeLabel(p), lat: p.lat, lon: p.lon, zone: p.zone } });
          setQuery(placeLabel(p));
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const matches = useMemo(() => (open ? searchPlaces(places, query, 7) : []), [places, query, open]);
  const pick = (p: Place): void => {
    onChange({ ...value, place: { label: placeLabel(p), lat: p.lat, lon: p.lon, zone: p.zone } });
    setQuery(placeLabel(p));
    setOpen(false);
  };

  return (
    <div className="design-form">
      {show.occasion !== false && (
        <label>
          Occasion
          <select value={value.occasion} onChange={(e) => set('occasion', e.target.value as Occasion)}>
            {OCCASIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        Names <span className="hint">on the front, e.g. “Ada & Grace”</span>
        <input value={value.names} maxLength={LIMITS.names} onChange={(e) => set('names', e.target.value)} placeholder="Optional" />
      </label>
      {show.message && (
        <label>
          Message <span className="hint">on the back of the card</span>
          <textarea value={value.message} maxLength={LIMITS.message} rows={2} onChange={(e) => set('message', e.target.value)} placeholder="Optional" />
        </label>
      )}
      <div className="row2">
        <label>
          Date
          <input type="date" value={value.date} onChange={(e) => set('date', e.target.value)} />
        </label>
        <label>
          Time <span className="hint">blank: noon, no houses</span>
          <input type="time" value={value.time} onChange={(e) => set('time', e.target.value)} />
        </label>
      </div>
      <label className="place">
        Place <span className="hint">the time is that town’s local time</span>
        <input
          value={query}
          role="combobox"
          aria-expanded={matches.length > 0}
          aria-autocomplete="list"
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (!matches.length) return;
            if (e.key === 'ArrowDown') (e.preventDefault(), setActive((active + 1) % matches.length));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setActive((active + matches.length - 1) % matches.length));
            else if (e.key === 'Enter' || e.key === 'Tab') {
              if (e.key === 'Enter') e.preventDefault();
              pick(matches[active]!);
            } else if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Type a town"
        />
        {matches.length > 0 && (
          <ul className="completer" role="listbox">
            {matches.map((p, i) => (
              <li key={`${p.name}${p.lat}${p.lon}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), pick(p))}>
                {placeLabel(p)}
              </li>
            ))}
          </ul>
        )}
      </label>
      <div className="row2">
        <label>
          Houses
          <select value={value.system} onChange={(e) => set('system', e.target.value as HouseSystem)}>
            {HOUSE_SYSTEMS.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
        {show.style !== false && (
          <label>
            Look
            <select value={value.style} onChange={(e) => set('style', e.target.value as 'paper' | 'night')}>
              <option value="night">Night sky</option>
              <option value="paper">Paper</option>
            </select>
          </label>
        )}
      </div>
      {(show.paper || show.calendar) && (
        <div className="row2">
          {show.paper && (
            <label>
              Paper
              <select value={value.paper} onChange={(e) => set('paper', e.target.value as 'letter' | 'a4')}>
                <option value="letter">Letter (5 × 7 in card)</option>
                <option value="a4">A4 (A6 card)</option>
              </select>
            </label>
          )}
          {show.calendar && (
            <label>
              First month
              <input type="month" value={value.start} onChange={(e) => set('start', e.target.value)} />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
