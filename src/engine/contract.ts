/**
 * The public API of `xray-wasm`, copied from the library's contract.
 *
 * The site never imports the library outside src/engine (an ESLint rule says
 * so); everything else is typed from this file, so the fake engine and the
 * real one are interchangeable. `real.ts` assigns the library's functions to
 * these types, which is where a drift between the two would fail `tsc`.
 *
 * Fields the site does not need to work are optional: a manifest made before
 * the library grew `channel` and `publishedAt` has neither, and versions.ts
 * falls back to a guess.
 */
export type Verdict = 'ok' | 'error' | 'inconclusive' | 'crashed' | 'timeout' | 'unavailable';

export type Channel = 'stable' | 'prerelease' | 'withdrawn';

export interface BuildInfo {
  tag: string;
  version: string;
  file: string;
  size: number;
  gzip: number;
  sha256: string;
  channel?: Channel;
  /** ISO 8601; for a withdrawn release, its commit date. */
  publishedAt?: string;
  /** The uncompressed binary, for hosts without DecompressionStream. */
  rawFile?: string;
  gzipSha256?: string;
  /** Xray-core commit the binary was built from. */
  commit?: string;
  /** Go release that built it. */
  go?: string;
  shims?: string[];
}

export interface Manifest {
  builds: BuildInfo[];
  wasmExec: { file: string; sha256: string; go: string };
}

export interface CheckResult {
  verdict: Verdict;
  ok: boolean;
  error?: string;
  tag: string;
  coreVersion?: string;
  missingFiles?: string[];
  skipped?: string[];
  durationMs: number;
  log: string[];
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  files: Record<string, Uint8Array>;
  durationMs: number;
  tag: string;
  timedOut?: boolean;
  /** stdout as bytes, for a command that prints binary (`convert pb` without -o). */
  stdoutBytes?: Uint8Array;
}

export interface XrayOptions {
  /** Folder holding manifest.json. */
  baseUrl: string | URL;
  fetch?: typeof fetch;
  worker?: boolean;
  /** Where the worker script is (default: next to the library's module). */
  workerUrl?: string | URL;
}

export interface CallOptions {
  tag: string;
  files?: Record<string, Uint8Array>;
  timeoutMs?: number;
}

export interface RunOptions extends CallOptions {
  stdin?: string | Uint8Array;
  cwd?: string;
}

export interface Xray {
  manifest(): Promise<Manifest>;
  prepare(tag: string, onProgress?: (loaded: number, total: number) => void): Promise<void>;
  check(configJson: string, opts: CallOptions): Promise<CheckResult>;
  run(args: string[], opts: RunOptions): Promise<RunResult>;
  dispose(): void;
}

export type CreateXray = (opts: XrayOptions) => Xray;
export type LoadManifest = (baseUrl: string | URL, f?: typeof fetch) => Promise<Manifest>;

/** Where the core looks for geoip.dat / geosite.dat (`XRAY_LOCATION_ASSET`). */
export const ASSET_DIR = '/usr/share/xray';
/** The working directory `run` uses; relative paths in `files` land here. */
export const WORK_DIR = '/work';
