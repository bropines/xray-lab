/**
 * The site's one door to the core.
 *
 * Wraps an `Xray` (the library, or the fake) with what every page needs and
 * the library leaves to its caller:
 *   - a store of per-version state (remote / cached / downloading with
 *     progress / ready / error) that the UI reads without asking;
 *   - one call at a time — each check or command starts a Go instance of its
 *     own, and two 12 MB cores at once is a lot for a phone;
 *   - cancelling a download (the contract has no AbortSignal, so this cancels
 *     the fetch underneath, through the caching `fetch` it hands the library);
 *   - results instead of exceptions: a check that cannot run is the
 *     `unavailable` verdict, a command that cannot run is exit code -1 —
 *     except a cancellation, which rejects with `CancelledError`.
 */
import { createStore, type StoreApi } from 'zustand/vanilla';
import type { BuildInfo, CheckResult, Manifest, RunOptions, RunResult, Xray } from './contract';
import { sortBuilds } from './versions';
import type { WasmCache } from './wasm-cache';

export type TagPhase = 'remote' | 'cached' | 'downloading' | 'ready' | 'error';

export interface TagState {
  phase: TagPhase;
  loaded: number;
  total: number;
  error?: string;
}

export interface EngineState {
  kind: 'real' | 'fake';
  baseUrl: string;
  manifest?: Manifest;
  /** Newest first. */
  builds: BuildInfo[];
  manifestError?: string;
  loadingManifest: boolean;
  tags: Record<string, TagState>;
  /** A check or command is running. */
  busy: boolean;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

export const isCancelled = (e: unknown): e is CancelledError => e instanceof CancelledError;

const isAbort = (e: unknown) =>
  (typeof DOMException !== 'undefined' && e instanceof DOMException && e.name === 'AbortError') ||
  (e instanceof Error && e.name === 'AbortError');

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export interface EngineOptions {
  kind: 'real' | 'fake';
  baseUrl: string;
  /** Makes the Xray; receives the fetch to hand to `createXray`. */
  create: (fetch: typeof globalThis.fetch | undefined) => Promise<Xray>;
  cache?: WasmCache;
}

export interface CheckCallOptions {
  files?: Record<string, Uint8Array>;
  timeoutMs?: number;
}

export class Engine {
  readonly store: StoreApi<EngineState>;
  private xray?: Promise<Xray>;
  private manifestPromise?: Promise<Manifest>;
  private controller = new AbortController();
  private queue: Promise<unknown> = Promise.resolve();
  private preparing = new Map<string, Promise<void>>();

  constructor(private readonly opts: EngineOptions) {
    this.store = createStore<EngineState>(() => ({
      kind: opts.kind,
      baseUrl: opts.baseUrl,
      builds: [],
      loadingManifest: false,
      tags: {},
      busy: false,
    }));
  }

  /** The signal the caching fetch ties downloads to. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  private getXray(): Promise<Xray> {
    if (!this.xray) {
      const p = this.opts.create(this.opts.cache?.fetch);
      this.xray = p;
      // A failed load is retried on the next call.
      p.catch(() => {
        if (this.xray === p) this.xray = undefined;
      });
    }
    return this.xray;
  }

  private setTag(tag: string, patch: Partial<TagState>) {
    this.store.setState(s => ({
      tags: { ...s.tags, [tag]: { ...(s.tags[tag] ?? { phase: 'remote', loaded: 0, total: 0 }), ...patch } },
    }));
  }

  loadManifest(): Promise<Manifest> {
    if (this.manifestPromise) return this.manifestPromise;
    this.store.setState({ loadingManifest: true, manifestError: undefined });
    const p = (async () => {
      const xray = await this.getXray();
      const manifest = await xray.manifest();
      const builds = sortBuilds(manifest.builds);
      const tags: Record<string, TagState> = {};
      await Promise.all(builds.map(async b => {
        const url = this.fileUrl(b.file);
        this.opts.cache?.expect(url, b.sha256);
        const cached = (await this.opts.cache?.has(url)) ?? false;
        tags[b.tag] = { phase: cached ? 'cached' : 'remote', loaded: 0, total: b.gzip || b.size };
      }));
      this.store.setState(s => ({ manifest, builds, tags: { ...tags, ...activeOnly(s.tags) }, loadingManifest: false }));
      return manifest;
    })();
    this.manifestPromise = p;
    p.catch(e => {
      if (this.manifestPromise === p) this.manifestPromise = undefined;
      this.store.setState({ loadingManifest: false, manifestError: messageOf(e) });
    });
    return p;
  }

  /** Absolute URL of a file named in the manifest. */
  fileUrl(file: string): string {
    const here = typeof location !== 'undefined' ? location.href : 'http://localhost/';
    const base = new URL(this.opts.baseUrl, here).href;
    return new URL(file, base.endsWith('/') ? base : `${base}/`).href;
  }

  build(tag: string): BuildInfo | undefined {
    return this.store.getState().builds.find(b => b.tag === tag);
  }

  /** Bytes a set of versions would still download (cached or loaded ones cost nothing). */
  downloadBytes(tags: readonly string[]): number {
    const { tags: states } = this.store.getState();
    return tags.reduce((sum, tag) => {
      const phase = states[tag]?.phase;
      if (phase === 'cached' || phase === 'ready') return sum;
      const b = this.build(tag);
      return sum + (b ? b.gzip || b.size : 0);
    }, 0);
  }

  /** Downloads (or reads from the cache) and compiles one core. */
  prepare(tag: string): Promise<void> {
    const state = this.store.getState().tags[tag];
    if (state?.phase === 'ready') return Promise.resolve();
    const pending = this.preparing.get(tag);
    if (pending) return pending;
    const build = this.build(tag);
    const fallbackTotal = build ? build.gzip || build.size : 0;
    const wasCached = state?.phase === 'cached';
    this.setTag(tag, { phase: 'downloading', loaded: 0, total: fallbackTotal, error: undefined });
    const signal = this.controller.signal;
    const p = (async () => {
      try {
        const xray = await this.getXray();
        await xray.prepare(tag, (loaded, total) => {
          if (signal.aborted) return;
          this.setTag(tag, { loaded, total: total > 0 ? total : fallbackTotal });
        });
        if (signal.aborted) throw new CancelledError();
        this.setTag(tag, { phase: 'ready', loaded: fallbackTotal, error: undefined });
      } catch (e) {
        if (signal.aborted || isAbort(e) || isCancelled(e)) {
          this.setTag(tag, { phase: wasCached ? 'cached' : 'remote', loaded: 0 });
          throw new CancelledError();
        }
        this.setTag(tag, { phase: 'error', error: messageOf(e) });
        throw e;
      } finally {
        this.preparing.delete(tag);
      }
    })();
    this.preparing.set(tag, p);
    return p;
  }

  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = async () => {
      this.store.setState({ busy: true });
      try {
        return await task();
      } finally {
        this.store.setState({ busy: false });
      }
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** `xray run -test` on one version. Never throws except `CancelledError`. */
  async check(configJson: string, tag: string, opts: CheckCallOptions = {}): Promise<CheckResult> {
    const started = now();
    try {
      await this.prepare(tag);
      return await this.exclusive(async () => (await this.getXray()).check(configJson, { tag, ...opts }));
    } catch (e) {
      if (isCancelled(e)) throw e;
      return { verdict: 'unavailable', ok: false, error: messageOf(e), tag, durationMs: now() - started, log: [] };
    }
  }

  /** Runs the `xray` CLI of one version. Never throws except `CancelledError`. */
  async run(args: string[], opts: RunOptions): Promise<RunResult> {
    const started = now();
    try {
      await this.prepare(opts.tag);
      return await this.exclusive(async () => (await this.getXray()).run(args, opts));
    } catch (e) {
      if (isCancelled(e)) throw e;
      return { exitCode: -1, stdout: '', stderr: messageOf(e), files: {}, durationMs: now() - started, tag: opts.tag };
    }
  }

  /** Stops every download in flight. A check already running finishes. */
  cancel(): void {
    this.controller.abort();
    this.controller = new AbortController();
  }

  async cachedBytes(): Promise<number> {
    const entries = (await this.opts.cache?.entries()) ?? [];
    return entries.reduce((sum, e) => sum + e.bytes, 0);
  }

  async clearCache(): Promise<void> {
    await this.opts.cache?.clear();
    this.store.setState(s => ({
      tags: Object.fromEntries(
        Object.entries(s.tags).map(([tag, st]) => [tag, st.phase === 'cached' ? { ...st, phase: 'remote' as const } : st]),
      ),
    }));
  }

  dispose(): void {
    const x = this.xray;
    this.xray = undefined;
    void x?.then(xray => xray.dispose(), () => undefined);
  }
}

/** States a manifest reload must not reset. */
const activeOnly = (tags: Record<string, TagState>) =>
  Object.fromEntries(Object.entries(tags).filter(([, s]) => s.phase === 'ready' || s.phase === 'downloading'));

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
