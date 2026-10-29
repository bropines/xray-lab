/**
 * The session's file system, shared by every page.
 *
 * The Check page's editor is `/work/config.json`, the terminal's `ls` lists
 * the same files, geo data the Check page fetched is `/usr/share/xray/geoip.dat`
 * for `xray run -test` too, and a certificate `tls cert` wrote can be opened
 * with `edit`. Paths are absolute inside; relative ones resolve against
 * `/work` (the library's cwd), `~` is `/work` as well.
 *
 * Small files under /work (≤ 512 KB) are kept in localStorage so a reload
 * keeps the config being worked on; geo data and anything bigger live only
 * as long as the tab. Nothing is ever sent anywhere.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ASSET_DIR, WORK_DIR } from '../engine/contract';

export interface FsFile {
  data: Uint8Array;
  mtime: number;
}

export interface FsEntry {
  name: string;
  path: string;
  dir: boolean;
  size: number;
  mtime: number;
}

export interface FsState {
  files: Record<string, FsFile>;
}

export const HOME = WORK_DIR;
export const CONFIG_PATH = `${WORK_DIR}/config.json`;
export { ASSET_DIR };

const PERSIST_KEY = 'xray-lab-files';
const PERSIST_LIMIT = 512 * 1024;

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Resolves `p` against `cwd`: `.`/`..`, repeated slashes and `~` handled. */
export function resolvePath(p: string, cwd: string = HOME): string {
  let path = p.trim();
  if (path === '~' || path.startsWith('~/')) path = HOME + path.slice(1);
  if (!path.startsWith('/')) path = `${cwd.replace(/\/+$/, '')}/${path}`;
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join('/')}`;
}

/** `/work/a.json` → `a.json`; anything outside /work stays absolute. */
export function displayPath(path: string): string {
  return path.startsWith(`${HOME}/`) ? path.slice(HOME.length + 1) : path;
}

const toB64 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export class SessionFs {
  readonly store: StoreApi<FsState>;

  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage()) {
    this.store = createStore<FsState>(() => ({ files: this.load() }));
  }

  private load(): Record<string, FsFile> {
    try {
      const raw = this.storage?.getItem(PERSIST_KEY);
      if (!raw) return {};
      const saved = JSON.parse(raw) as Record<string, { d: string; t: number }>;
      return Object.fromEntries(Object.entries(saved).map(([path, f]) => [path, { data: fromB64(f.d), mtime: f.t }]));
    } catch {
      return {};
    }
  }

  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  /** Saves soon rather than on every keystroke in the editor. */
  private persist() {
    if (!this.storage) return;
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 400);
  }

  persistNow() {
    clearTimeout(this.persistTimer);
    if (!this.storage) return;
    const keep: Record<string, { d: string; t: number }> = {};
    for (const [path, f] of Object.entries(this.store.getState().files)) {
      if (path.startsWith(`${HOME}/`) && f.data.length <= PERSIST_LIMIT) keep[path] = { d: toB64(f.data), t: f.mtime };
    }
    try {
      this.storage.setItem(PERSIST_KEY, JSON.stringify(keep));
    } catch {
      // Quota or blocked storage: the files still live for this tab.
    }
  }

  read(path: string): Uint8Array | undefined {
    return this.store.getState().files[resolvePath(path)]?.data;
  }

  readText(path: string): string | undefined {
    const data = this.read(path);
    return data ? dec.decode(data) : undefined;
  }

  exists(path: string): boolean {
    return !!this.store.getState().files[resolvePath(path)];
  }

  /** True when `path` is a directory: a prefix of some file (or `/`, `/work`, the asset dir). */
  isDir(path: string): boolean {
    const p = resolvePath(path);
    if (p === '/' || p === HOME || p === '/usr' || p === '/usr/share' || p === ASSET_DIR) return true;
    return Object.keys(this.store.getState().files).some(f => f.startsWith(`${p}/`));
  }

  write(path: string, content: Uint8Array | string): string {
    const p = resolvePath(path);
    const data = typeof content === 'string' ? enc.encode(content) : content;
    const prev = this.store.getState().files[p];
    if (prev && sameBytes(prev.data, data)) return p;
    this.store.setState(s => ({ files: { ...s.files, [p]: { data, mtime: Date.now() } } }));
    this.persist();
    return p;
  }

  writeMany(files: Record<string, Uint8Array>, cwd: string = HOME): string[] {
    return Object.entries(files).map(([path, data]) => this.write(resolvePath(path, cwd), data));
  }

  remove(path: string): boolean {
    const p = resolvePath(path);
    if (!this.store.getState().files[p]) return false;
    this.store.setState(s => {
      const files = { ...s.files };
      delete files[p];
      return { files };
    });
    this.persist();
    return true;
  }

  /** Files and implied directories directly in `dir`, directories first, then by name. */
  list(dir: string = HOME): FsEntry[] {
    const base = resolvePath(dir);
    const prefix = base === '/' ? '/' : `${base}/`;
    const out = new Map<string, FsEntry>();
    for (const [path, f] of Object.entries(this.store.getState().files)) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...more] = path.slice(prefix.length).split('/');
      if (!name) continue;
      if (more.length) {
        const prev = out.get(name);
        out.set(name, { name, path: prefix + name, dir: true, size: 0, mtime: Math.max(prev?.mtime ?? 0, f.mtime) });
      } else {
        out.set(name, { name, path, dir: false, size: f.data.length, mtime: f.mtime });
      }
    }
    // The two directories the core cares about always exist.
    if (base === '/') {
      for (const d of ['work', 'usr']) if (!out.has(d)) out.set(d, { name: d, path: `/${d}`, dir: true, size: 0, mtime: 0 });
    }
    return [...out.values()].sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
  }

  /** Every file, by absolute path — what a core call receives. */
  snapshot(): Record<string, Uint8Array> {
    return Object.fromEntries(Object.entries(this.store.getState().files).map(([p, f]) => [p, f.data]));
  }

  paths(): string[] {
    return Object.keys(this.store.getState().files).sort();
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export const textOf = (data: Uint8Array) => dec.decode(data);

/** Heuristic: shows as text when it decodes and has no NUL bytes in its first 4 KB. */
export function looksLikeText(data: Uint8Array): boolean {
  const head = data.subarray(0, 4096);
  if (head.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(head);
    return true;
  } catch {
    // A multi-byte character cut at 4096 is still text.
    return head.length === 4096;
  }
}
