/**
 * sp4cetime.org shows no prices (owner, 2 November 2026): Starsigns' path, video, card and
 * path file are free; ✶ Customize goes to sp4cetime.shop (cards and videos for occasions,
 * names, artwork, GIFs, posters, screen savers, templates; later others' templates and
 * paths); ☕ Buy us a coffee! is a Stripe Payment Link (ADR-0018).
 */

export const SHOP_URL = 'https://sp4cetime.shop/';
/** Turned on once sp4cetime.shop is up (until then ✶ Customize says it is coming). */
export const SHOP_OPEN = false;
/**
 * "☕ Buy us a coffee!": a Stripe Payment Link where the buyer chooses the amount (the
 * owner makes it in the Stripe dashboard and pastes its https://buy.stripe.com/… address
 * here). Empty: the button is not shown.
 */
export const COFFEE_URL = '';

/** What the shop needs to make the same package, carried in the link's fragment (never sent to a server). */
export interface ShopOrder {
  readonly date: string;
  readonly time: string | null;
  readonly place: { readonly label: string; readonly name: string; readonly lat: number; readonly lon: number; readonly zone: string | null };
  readonly name: string;
  readonly system: 'whole' | 'equal';
  readonly pdf: { readonly title: string; readonly paper: 'letter' | 'a4'; readonly style: 'paper' | 'night' };
}

export function shopLink(order: ShopOrder): string {
  const json = JSON.stringify(order);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${SHOP_URL}#starsigns=${b64}`;
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
