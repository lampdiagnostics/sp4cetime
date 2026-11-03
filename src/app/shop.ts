/**
 * sp4cetime.org shows no prices (owner, 2 November 2026): Starsigns' path, video, card and
 * path token are free; ✶ Customize goes to sp4cetime.store (cards, calendars, screensavers,
 * phone backgrounds, readouts; ADR-0019); ☕ Buy us a coffee! is a Stripe Payment Link.
 */

import { type Design, encodeDesign } from '../core/catalog';

export const SHOP_URL = 'https://sp4cetime.store/';
/** Turned on once sp4cetime.store takes live payments (until then ✶ Customize says it is coming). */
export const SHOP_OPEN = false;
/**
 * "☕ Buy us a coffee!": a Stripe Payment Link where the buyer chooses the amount (made in the
 * Stripe dashboard, product "Buy us a coffee (sp4cetime)", lookup key coffee). Paste the live
 * https://donate.stripe.com/… address here; empty hides the button.
 */
export const COFFEE_URL = '';

/** The design and the clock time as typed, in the link's fragment (never sent to a server). */
export function shopLink(design: Design, local: { date: string; time: string; zone: string | null }): string {
  const json = JSON.stringify({ design: JSON.parse(encodeDesign(design)), ...local });
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${SHOP_URL}make/card#starsigns=${b64}`;
}

/** Save bytes as a file. */
export function saveBytes(bytes: Uint8Array, name: string, type: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Open a PDF in a new tab to look at (or save it, where a tab cannot be opened). */
export function viewPdf(bytes: Uint8Array, name: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const w = window.open(url, '_blank', 'noopener');
  if (!w) saveBytes(bytes, name, 'application/pdf');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
