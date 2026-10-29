/**
 * The engine the site uses — one instance, made here.
 *
 * Which one: `VITE_FAKE_ENGINE=1` builds the fake (src/engine/fake.ts) and
 * never bundles the library; otherwise the library (`xray-wasm`), loaded on
 * first use as a chunk of its own.
 *
 * Where the cores come from (`baseUrl`, the folder holding manifest.json):
 * `VITE_XRAY_WASM_BASE` when set at build time — an absolute URL, or a path
 * relative to the page (`./xray-wasm/` to serve copies alongside; `bun run
 * dev:local` serves ../xray-wasm/dist-wasm there) — else the library's own
 * GitHub Pages, which sends `Access-Control-Allow-Origin: *`.
 */
import { useStore } from 'zustand';
import { Engine, type EngineState } from './engine';
import { createWasmCache } from './wasm-cache';

export const LIBRARY_PAGES_URL = 'https://bropines.github.io/xray-wasm/';

export const ENGINE_KIND: 'real' | 'fake' = import.meta.env.VITE_FAKE_ENGINE === '1' ? 'fake' : 'real';

export const WASM_BASE_URL: string = import.meta.env.VITE_XRAY_WASM_BASE || LIBRARY_PAGES_URL;

const cache = createWasmCache({ abortSignal: () => engine.signal });

export const engine: Engine = new Engine({
  kind: ENGINE_KIND,
  baseUrl: WASM_BASE_URL,
  cache,
  create: async fetch => {
    if (ENGINE_KIND === 'fake') {
      const { createFakeXray } = await import('./fake');
      return createFakeXray();
    }
    const { createXray } = await import('./real');
    const baseUrl = new URL(WASM_BASE_URL, location.href);
    return createXray({ baseUrl, fetch, worker: true });
  },
});

export function useEngine<T>(selector: (s: EngineState) => T): T {
  return useStore(engine.store, selector);
}

export { CancelledError, isCancelled, type EngineState, type TagPhase, type TagState } from './engine';
export * from './contract';
export * from './versions';
