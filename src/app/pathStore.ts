/**
 * Saved paths, on this device (IndexedDB), with `.sp4ce.json` export and import. Local
 * first (ADR-0004): no account; cloud storage comes with accounts and sync later. If the
 * browser keeps no storage (a private window), paths last for this visit only.
 */
import { type Path, parsePath, parseSp4ceFile, pathFileName, toSp4ceFile } from '../core/path';

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

/** Download a path as `name.sp4ce.json`. */
export function exportPath(p: Path): void {
  const blob = new Blob([JSON.stringify(toSp4ceFile(p), null, 1)], { type: 'application/json' });
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
