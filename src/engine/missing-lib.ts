/**
 * Stands in for `xray-wasm` when the library is not installed (it is an
 * optional dependency). Same exports, same types; every call fails, and the
 * engine turns that into the `unavailable` verdict with this message.
 *
 * Resolved by tsconfig.json `paths` and by the fallback plugin in
 * vite.config.ts — never imported by name.
 */
import type { Manifest, Xray, XrayOptions } from './contract';

const MESSAGE = 'xray-wasm is not installed in this build (see README: "Local development").';

export const ASSET_DIR = '/usr/share/xray';

export function loadManifest(_baseUrl: string | URL, _f?: typeof fetch): Promise<Manifest> {
  return Promise.reject(new Error(MESSAGE));
}

export function createXray(_opts: XrayOptions): Xray {
  const fail = () => Promise.reject(new Error(MESSAGE));
  return { manifest: fail, prepare: fail, check: fail, run: fail, dispose: () => {} };
}
