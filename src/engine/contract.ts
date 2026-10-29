/**
 * The public API of `xray-wasm`, copied from the library's contract.
 *
 * The site never imports the library outside src/engine (an ESLint rule says
 * so); everything else is typed from this file, so the fake engine and the
 * real one are interchangeable. `real.ts` assigns the library's functions to
 * these types, which is where a drift between the two would fail `tsc`.
 *
 * `channel` and `publishedAt` are optional: manifests made before the library
 * grew them have neither, and versions.ts falls back to a guess.
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
  publishedAt?: string;
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
}

export interface XrayOptions {
  /** Folder holding manifest.json. */
  baseUrl: string | URL;
  fetch?: typeof fetch;
  worker?: boolean;
}

export interface CallOptions {
  tag: string;
  files?: Record<string, Uint8Array>;
  timeoutMs?: number;
}

export interface RunOptions extends CallOptions {
  stdin?: string;
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
