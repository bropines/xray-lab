/**
 * A `fetch` for the library that keeps core binaries in Cache Storage.
 *
 * Each core is about 12 MB gzip, and GitHub Pages sends `max-age=600`, so the
 * browser's own HTTP cache forgets them within minutes. This wrapper is
 * handed to `createXray({ fetch })`: binaries (`*.wasm`, `*.wasm.gz`) are
 * served cache-first under a key that carries the manifest's sha256, so a
 * rebuilt binary with the same name is fetched again and the old one is
 * dropped. Everything else (the manifest, wasm_exec.js) goes to the network.
 *
 * It also lets the site cancel a download: every request made while
 * `abortSignal()` returns a signal is tied to it.
 *
 * Where Cache Storage is missing (an insecure origin, tests) it is a plain
 * pass-through.
 */
export interface WasmCache {
  fetch: typeof fetch;
  /** Tells the cache which sha256 a URL should have (from the manifest). */
  expect(url: string, sha256: string): void;
  has(url: string): Promise<boolean>;
  /** Cached binaries and their sizes in bytes. */
  entries(): Promise<{ url: string; bytes: number }[]>;
  clear(): Promise<void>;
}

export const CACHE_NAME = 'xray-lab-cores-v1';

const isBinary = (url: string) => /\.wasm(\.gz)?$/i.test(url.split(/[?#]/)[0] ?? '');
const stripQuery = (url: string) => url.split(/[?#]/)[0] ?? url;

export function createWasmCache(opts: {
  baseFetch?: typeof fetch;
  abortSignal?: () => AbortSignal | undefined;
  cacheName?: string;
}): WasmCache {
  const baseFetch = opts.baseFetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const cacheName = opts.cacheName ?? CACHE_NAME;
  const expected = new Map<string, string>();
  const storage = typeof caches !== 'undefined' ? caches : undefined;

  const keyOf = (url: string) => {
    const plain = stripQuery(url);
    const sha = expected.get(plain);
    return sha ? `${plain}?sha256=${sha}` : plain;
  };

  const withSignal = (init: RequestInit | undefined): RequestInit | undefined => {
    const extra = opts.abortSignal?.();
    if (!extra) return init;
    const signal = init?.signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, extra]) : extra;
    return { ...init, signal };
  };

  const cachedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const req = withSignal(init);
    if (!storage || !isBinary(url) || (init?.method && init.method !== 'GET')) return baseFetch(input, req);
    const cache = await storage.open(cacheName);
    const key = keyOf(url);
    const hit = await cache.match(key);
    if (hit) return hit;
    const response = await baseFetch(input, req);
    if (response.ok && response.status === 200) {
      // The library reads `response`; the cache reads the clone. A download
      // cancelled half-way errors both, so nothing partial is stored.
      const copy = response.clone();
      void (async () => {
        try {
          for (const old of await cache.keys()) {
            if (stripQuery(old.url) === stripQuery(url) && old.url !== key) await cache.delete(old);
          }
          await cache.put(key, copy);
        } catch {
          // Quota exceeded or the download was cancelled: just not cached.
        }
      })();
    }
    return response;
  }) as typeof fetch;

  return {
    fetch: cachedFetch,
    expect(url, sha256) {
      expected.set(stripQuery(url), sha256);
    },
    async has(url) {
      if (!storage) return false;
      try {
        const cache = await storage.open(cacheName);
        return !!(await cache.match(keyOf(url)));
      } catch {
        return false;
      }
    },
    async entries() {
      if (!storage) return [];
      const cache = await storage.open(cacheName);
      const out: { url: string; bytes: number }[] = [];
      for (const req of await cache.keys()) {
        const res = await cache.match(req);
        const len = Number(res?.headers.get('content-length') ?? NaN);
        out.push({ url: req.url, bytes: Number.isFinite(len) ? len : (await res?.clone().arrayBuffer())?.byteLength ?? 0 });
      }
      return out;
    },
    async clear() {
      if (storage) await storage.delete(cacheName);
    },
  };
}
