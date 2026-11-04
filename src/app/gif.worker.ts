/** The GIF encoder off the main thread (capture.ts), so the view keeps moving smoothly while frames are compressed. */
import { GifEncoder } from './gif';

let enc: GifEncoder | null = null;
self.onmessage = (e: MessageEvent<{ type: 'init'; w: number; h: number } | { type: 'frame'; rgba: ArrayBuffer; delayCs: number } | { type: 'finish' }>) => {
  const m = e.data;
  if (m.type === 'init') enc = new GifEncoder(m.w, m.h, 5);
  else if (m.type === 'frame') enc?.add(new Uint8ClampedArray(m.rgba), m.delayCs);
  else if (m.type === 'finish') {
    const blob = enc && enc.frames > 0 ? enc.finish() : null;
    if (!blob) return self.postMessage({ type: 'done' });
    void blob.arrayBuffer().then((bytes) => (self as unknown as Worker).postMessage({ type: 'done', bytes }, [bytes]));
  }
};
