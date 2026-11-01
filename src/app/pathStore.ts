/**
 * Paths are `.sp4ce.json` files (ADR-0017): people download theirs, keep them, and upload
 * them again to present or keep working on them. No account and no server: the browser
 * also keeps a copy of each (IndexedDB) so the list survives a reload, and the app ships
 * example paths as files in `public/paths/`. If the browser keeps no storage (a private
 * window), paths last for this visit only; the files are what last.
 */
import { type Path, parsePath, parseSp4ceFile, pathFileName, toSp4ceFile } from '../core/path';
import { formatTime } from '../core/time';

const DB = 'sp4cetime';
const STORE = 'paths';
const memory = new Map<string, Path>();

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = f(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

/** Every saved path, newest first. */
export async function listPaths(): Promise<Path[]> {
  const raw = await run<unknown[]>('readonly', (s) => s.getAll());
  const out = new Map(memory);
  for (const r of raw ?? []) {
    try {
      const p = parsePath(r);
      out.set(p.id, p);
    } catch {
      /* a damaged entry is skipped */
    }
  }
  return [...out.values()].sort((a, b) => (a.created < b.created ? 1 : -1));
}

export async function savePath(p: Path): Promise<void> {
  memory.set(p.id, p);
  await run('readwrite', (s) => s.put(JSON.parse(JSON.stringify(p)) as Path));
}

export async function deletePath(id: string): Promise<void> {
  memory.delete(id);
  await run('readwrite', (s) => s.delete(id));
}

/** A path as the text of its file: indented, with each list of numbers on one line. */
export function sp4ceText(p: Path): string {
  const json = JSON.stringify(toSp4ceFile(p, (t) => formatTime(t, 1)), null, 1);
  return `${json.replace(/\[\s+([-\d.e+,\s]+?)\s+\]/g, (_m, inner: string) => `[${inner.trim().split(/,\s*/).join(', ')}]`)}\n`;
}

/** Download a path as `name.sp4ce.json`. */
export function exportPath(p: Path): void {
  const blob = new Blob([sp4ceText(p)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pathFileName(p.name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Read a `.sp4ce.json` file; throws a plain-language error if it is not a path. */
export async function importPath(file: File): Promise<Path> {
  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('That file is not a sp4cetime path (it is not JSON).');
  }
  const p = parseSp4ceFile(data);
  await savePath(p);
  return p;
}

/** The app's own example paths: `public/paths/index.json` lists the files. */
export async function loadExamples(base: string): Promise<Path[]> {
  try {
    const list = (await (await fetch(`${base}paths/index.json`)).json()) as unknown;
    if (!Array.isArray(list)) return [];
    const out: Path[] = [];
    for (const name of list) {
      if (typeof name !== 'string' || !/^[\w.-]+\.sp4ce\.json$/.test(name)) continue;
      try {
        const p = parseSp4ceFile(await (await fetch(`${base}paths/${name}`)).json());
        out.push({ ...p, id: `example:${name}` });
      } catch (e) {
        console.warn(`Example path ${name} not read:`, e);
      }
    }
    return out;
  } catch {
    return [];
  }
}
