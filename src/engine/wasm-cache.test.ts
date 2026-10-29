import { afterEach, describe, expect, test } from 'bun:test';
import { createWasmCache } from './wasm-cache';

/** Just enough Cache Storage for the wrapper. */
function installFakeCaches() {
  const stores = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    const m = stores.get(name) ?? new Map<string, Response>();
    stores.set(name, m);
    return {
      match: async (key: string) => m.get(typeof key === 'string' ? key : (key as Request).url)?.clone(),
      put: async (key: string, res: Response) => {
        m.set(key, new Response(await res.arrayBuffer(), { headers: res.headers }));
      },
      keys: async () => [...m.keys()].map(url => ({ url }) as Request),
      delete: async (req: Request | string) => m.delete(typeof req === 'string' ? req : req.url),
    };
  };
  (globalThis as { caches?: unknown }).caches = { open, delete: async (name: string) => stores.delete(name) };
  return stores;
}

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches;
});

const flush = () => new Promise(r => setTimeout(r, 10));

describe('wasm cache', () => {
  test('passes through when there is no Cache Storage', async () => {
    let calls = 0;
    const cache = createWasmCache({ baseFetch: (async () => { calls++; return new Response('x'); }) as unknown as typeof fetch });
    await cache.fetch('http://h/v1.xray.wasm.gz');
    await cache.fetch('http://h/v1.xray.wasm.gz');
    expect(calls).toBe(2);
    expect(await cache.has('http://h/v1.xray.wasm.gz')).toBe(false);
  });

  test('serves a binary from the cache the second time, keyed by sha256', async () => {
    installFakeCaches();
    let calls = 0;
    const cache = createWasmCache({
      baseFetch: (async () => {
        calls++;
        return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-length': '3' } });
      }) as unknown as typeof fetch,
    });
    const url = 'http://h/v26.7.28.xray.wasm.gz';
    cache.expect(url, 'aaa');
    expect(new Uint8Array(await (await cache.fetch(url)).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    await flush();
    expect(await cache.has(url)).toBe(true);
    await cache.fetch(url);
    expect(calls).toBe(1);
    // A rebuilt binary (new sha) is fetched again and replaces the old one.
    cache.expect(url, 'bbb');
    expect(await cache.has(url)).toBe(false);
    await cache.fetch(url);
    await flush();
    expect(calls).toBe(2);
    expect((await cache.entries()).map(e => e.url)).toEqual([`${url}?sha256=bbb`]);
  });

  test('leaves the manifest to the network', async () => {
    installFakeCaches();
    let calls = 0;
    const cache = createWasmCache({ baseFetch: (async () => { calls++; return new Response('{}'); }) as unknown as typeof fetch });
    await cache.fetch('http://h/manifest.json');
    await cache.fetch('http://h/manifest.json');
    expect(calls).toBe(2);
  });

  test('ties requests to the abort signal it is given', async () => {
    const ctrl = new AbortController();
    let signal: AbortSignal | undefined;
    const cache = createWasmCache({
      abortSignal: () => ctrl.signal,
      baseFetch: (async (_: unknown, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Response('x');
      }) as unknown as typeof fetch,
    });
    await cache.fetch('http://h/manifest.json');
    ctrl.abort();
    expect(signal?.aborted).toBe(true);
  });
});
