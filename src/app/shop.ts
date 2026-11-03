/**
 * The Starsigns package (ADR-0018): the path is free to play, record (◉ Capture) and
 * download; personalising it (a name, artwork) and the clean video, card and pictures are
 * US$1.49 on sp4cetime.shop. Until the shop is open, the paid download works only in
 * development (`npm run dev`), so the owner can try it; everyone else sees "opens soon".
 */

export const SHOP_URL = 'https://sp4cetime.shop/';
export const PRICE = 'US$1.49';
/** Turned on once sp4cetime.shop takes payments. */
export const SHOP_OPEN = false;
/** The full package can be made here without paying: only while developing. */
export const UNLOCKED = import.meta.env.DEV;

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
