/**
 * The watch-style buttons' icons (owner, 5 Nov 2026: "little buttons, like on a watch, with an
 * icon that represents what it is"). Line drawings on a 24 × 24 grid in the text colour, so they
 * follow the theme; filled shapes only where a watch would fill them (play, pause, the hub).
 */

import type { ReactElement, ReactNode } from 'react';

type P = { size?: number };

function Svg({ size = 22, children }: { size?: number | undefined; children: ReactNode }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Now: a clock face, its hands at ten past ten. */
export function NowIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.2V12l3.4 2" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** The calendar: a calendar page with the Sun's line running across it. */
export function CalendarIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <rect x="3.8" y="5.2" width="16.4" height="15" rx="2.4" />
      <path d="M8 3.4v3.4M16 3.4v3.4M3.8 9.6h16.4" />
      <path d="M6.5 15.2h11" strokeWidth="1.3" opacity="0.7" />
      <circle cx="12" cy="15.2" r="1.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Fly: a little spaceship heading up and to the right. */
export function SpaceshipIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <g transform="rotate(45 12 12)">
        <path d="M12 2.6c2.6 2.3 3.7 5.6 3.3 10.4H8.7C8.3 8.2 9.4 4.9 12 2.6Z" />
        <circle cx="12" cy="8.3" r="1.5" />
        <path d="M8.8 10.6 6.3 13.9l2.6.6M15.2 10.6l2.5 3.3-2.6.6" />
        <path d="M10.2 13.1l.4 2.2h2.8l.4-2.2" />
        <path d="M12 16.8v3.3" strokeWidth="2" opacity="0.55" />
      </g>
    </Svg>
  );
}

/** Two arms of a logarithmic spiral (r = a·e^(bθ)), as polylines: the Galaxy button. */
function spiralArm(turn: number): string {
  const pts: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const t = (i / 40) * 1.55 * Math.PI;
    const r = 1.55 * Math.exp(0.36 * t);
    const a = t + turn;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a) * 0.82).toFixed(2)}`);
  }
  return pts.join(' ');
}
const ARM_A = spiralArm(0);
const ARM_B = spiralArm(Math.PI);

/** Galaxy: a spiral galaxy, its bright core and two arms. */
export function GalaxyIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <g transform="rotate(-18 12 12)">
        <polyline points={ARM_A} />
        <polyline points={ARM_B} />
        <ellipse cx="12" cy="12" rx="2.1" ry="1.7" fill="currentColor" stroke="none" />
      </g>
      <circle cx="19.6" cy="5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="4.6" cy="19.2" r="0.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * Speed: a speedometer. `turn` puts the needle anywhere from −1 (fully left: fastest backwards)
 * through 0 (straight up) to 1 (fully right: fastest forwards).
 */
export function SpeedometerIcon({ size, turn = 0.15 }: P & { turn?: number }): ReactElement {
  const deg = Math.max(-1, Math.min(1, turn)) * 115;
  return (
    <Svg size={size}>
      <path d="M4.4 17.6A8.6 8.6 0 1 1 19.6 17.6" />
      <path d="M12 6v1.4M6.6 8.4l1 1M17.4 8.4l-1 1M4.6 13h1.4M18 13h1.4" strokeWidth="1.4" />
      <g transform={`rotate(${deg.toFixed(1)} 12 14)`}>
        <path d="M12 14V7.6" strokeWidth="2" className="needle" />
      </g>
      <circle cx="12" cy="14" r="1.7" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function PlayIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <path d="M8.5 5.6v12.8a.6.6 0 0 0 .9.5l10-6.4a.6.6 0 0 0 0-1L9.4 5.1a.6.6 0 0 0-.9.5Z" fill="currentColor" strokeWidth="1" />
    </Svg>
  );
}

export function PauseIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <rect x="6.6" y="5.4" width="3.6" height="13.2" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.8" y="5.4" width="3.6" height="13.2" rx="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** ✶ Starsigns: a four-pointed twinkle with a small star beside it. */
export function StarsignsIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <path d="M11 3.5c.5 4.3 2.2 6 6.5 6.5-4.3.5-6 2.2-6.5 6.5-.5-4.3-2.2-6-6.5-6.5 4.3-.5 6-2.2 6.5-6.5Z" fill="currentColor" strokeWidth="1.2" />
      <path d="M18 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z" fill="currentColor" strokeWidth="0.8" />
    </Svg>
  );
}

/** The window's shape: round, or the full screen. */
export function WindowIcon({ size, round }: P & { round: boolean }): ReactElement {
  return <Svg size={size}>{round ? <circle cx="12" cy="12" r="7.5" /> : <rect x="3.5" y="6" width="17" height="12" rx="2" />}</Svg>;
}

/** ◉ Capture: a camera. */
export function CameraIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <path d="M4 8.2a1.7 1.7 0 0 1 1.7-1.7h2.1l1.4-2h5.6l1.4 2h2.1A1.7 1.7 0 0 1 20 8.2v9.1a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 17.3Z" />
      <circle cx="12" cy="12.6" r="3.4" />
    </Svg>
  );
}

/** ▷ Paths: a route of points, flown from START to the flag at END. */
export function PathsIcon({ size }: P): ReactElement {
  return (
    <Svg size={size}>
      <circle cx="5.5" cy="18.5" r="2" />
      <path d="M7.4 17.6c4.4-1.4 1.6-5.4 5.4-6.6 2.4-.8 3.6-.2 4.6-2.2" strokeDasharray="2.2 2.4" />
      <path d="M17.6 10V3.4l3.6 1.7-3.6 1.7" />
    </Svg>
  );
}

/** ☰ More, or ✕ to close it. */
export function MoreIcon({ size, open }: P & { open: boolean }): ReactElement {
  return <Svg size={size}>{open ? <path d="M7 7l10 10M17 7 7 17" strokeWidth="2" /> : <path d="M5.5 7.5h13M5.5 12h13M5.5 16.5h13" strokeWidth="1.9" />}</Svg>;
}
