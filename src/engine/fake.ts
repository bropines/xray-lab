/**
 * ⚠️  FAKE ENGINE — NOT XRAY-CORE.  ⚠️
 *
 * A stand-in for `xray-wasm` with the same interface, used only when the site
 * is built with `VITE_FAKE_ENGINE=1` (and by the tests). It lets the UI be
 * built and looked at before the library exists or without downloading
 * 12 MB cores. Its verdicts are a handful of heuristics and its keys are
 * random bytes: nothing it prints means anything. The UI shows a banner while
 * it is in use, and every check log says so.
 */
import type { BuildInfo, CallOptions, CheckResult, Manifest, RunOptions, RunResult, Xray, XrayOptions } from './contract';
import { ASSET_DIR, WORK_DIR } from './contract';

const FAKE_BUILDS: Array<Pick<BuildInfo, 'tag' | 'channel' | 'publishedAt'>> = [
  { tag: 'v26.10.21', channel: 'stable', publishedAt: '2026-10-21T00:00:00Z' },
  { tag: 'v26.10.10', channel: 'withdrawn', publishedAt: '2026-10-10T00:00:00Z' },
  { tag: 'v26.9.30', channel: 'prerelease', publishedAt: '2026-09-30T00:00:00Z' },
  { tag: 'v26.9.9', channel: 'prerelease', publishedAt: '2026-09-09T00:00:00Z' },
  { tag: 'v26.7.28', channel: 'stable', publishedAt: '2026-07-28T00:00:00Z' },
  { tag: 'v26.7.11', channel: 'prerelease', publishedAt: '2026-07-11T00:00:00Z' },
  { tag: 'v26.6.27', channel: 'prerelease', publishedAt: '2026-06-27T00:00:00Z' },
  { tag: 'v26.6.22', channel: 'prerelease', publishedAt: '2026-06-22T00:00:00Z' },
  { tag: 'v26.6.1', channel: 'prerelease', publishedAt: '2026-06-01T00:00:00Z' },
  { tag: 'v26.5.9', channel: 'prerelease', publishedAt: '2026-05-09T00:00:00Z' },
  { tag: 'v26.5.3', channel: 'prerelease', publishedAt: '2026-05-03T00:00:00Z' },
  { tag: 'v26.4.25', channel: 'prerelease', publishedAt: '2026-04-25T00:00:00Z' },
  { tag: 'v26.4.17', channel: 'prerelease', publishedAt: '2026-04-17T00:00:00Z' },
  { tag: 'v26.4.15', channel: 'prerelease', publishedAt: '2026-04-15T00:00:00Z' },
  { tag: 'v26.4.13', channel: 'prerelease', publishedAt: '2026-04-13T00:00:00Z' },
  { tag: 'v26.3.27', channel: 'prerelease', publishedAt: '2026-03-27T00:00:00Z' },
];

export const FAKE_NOTICE = '[fake engine] This is not Xray-core: the result is made up (VITE_FAKE_ENGINE=1).';

export interface FakeOptions {
  /** Milliseconds a simulated download takes. Tests pass 0. */
  downloadMs?: number;
  builds?: Array<Pick<BuildInfo, 'tag' | 'channel' | 'publishedAt'>>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

function b64(bytes: Uint8Array, url: boolean): string {
  let s = '';
  for (const x of bytes) s += String.fromCharCode(x);
  const out = btoa(s);
  return url ? out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : out;
}

const version = (tag: string) => tag.replace(/^v/, '');

/** Xray's `uuid -i`: UUIDv5-like SHA-1 of 16 zero bytes + the input (common/uuid ParseString). */
export async function xrayUuidFromString(input: string): Promise<string> {
  const data = new Uint8Array(16 + enc.encode(input).length);
  data.set(enc.encode(input), 16);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', data)).slice(0, 16);
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...h].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Go's flag package: `-name value`, `-name=value`, `--name value`; booleans take no value. */
function parseFlags(args: string[], booleans: string[] = []): { flags: Map<string, string[]>; rest: string[] } {
  const flags = new Map<string, string[]>();
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i] ?? '';
    if (a === '--') { rest.push(...args.slice(i + 1)); break; }
    const m = /^--?([^=]+)(?:=(.*))?$/.exec(a);
    if (!m || a === '-') { rest.push(a); continue; }
    const name = m[1] ?? '';
    let value = m[2];
    if (value === undefined) value = booleans.includes(name) ? 'true' : (args[++i] ?? '');
    flags.set(name, [...(flags.get(name) ?? []), value]);
  }
  return { flags, rest };
}

const abs = (cwd: string, p: string) => (p.startsWith('/') ? p : `${cwd.replace(/\/$/, '')}/${p}`);

function fakeCheck(json: string, tag: string, files: Record<string, Uint8Array>): Omit<CheckResult, 'durationMs' | 'tag'> {
  const log = [FAKE_NOTICE];
  let config: unknown;
  try {
    config = JSON.parse(json);
  } catch (e) {
    return { verdict: 'error', ok: false, log, error: `infra/conf/serial: failed to read config file > ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return { verdict: 'error', ok: false, log, error: 'infra/conf/serial: failed to read config file > json: cannot unmarshal into Go value of type conf.Config' };
  }
  const text = json;
  const missing: string[] = [];
  for (const [ref, file] of [['geoip:', 'geoip.dat'], ['geosite:', 'geosite.dat']] as const) {
    if (text.includes(`"${ref}`) && !files[`${ASSET_DIR}/${file}`]) missing.push(`${ASSET_DIR}/${file}`);
  }
  if (missing.length) {
    return {
      verdict: 'inconclusive',
      ok: false,
      log,
      missingFiles: missing,
      error: `infra/conf: failed to load geo data > open ${missing[0]}: no such file or directory`,
    };
  }
  const minor = Number(version(tag).split('.')[1] ?? 0);
  const patch = Number(version(tag).split('.')[2] ?? 0);
  if (/"protocol"\s*:\s*"masque"/.test(text) && (minor < 9 || (minor === 9 && patch < 30))) {
    return { verdict: 'error', ok: false, log, error: 'infra/conf: failed to load outbound config > unknown config id: masque' };
  }
  const skipped = /"protocol"\s*:\s*"tun"/.test(text) ? ['tun: the Linux and Windows checks of a tun inbound do not run in the browser.'] : undefined;
  return { verdict: 'ok', ok: true, log, skipped };
}

const ROOT_HELP = (v: string) => `Xray is a platform for building proxies.

Usage:

        xray <command> [arguments]

The commands are:

        run          Run Xray with config, the default command
        version      Show current version of Xray
        api          Call an API in an Xray process
        base64       Encode and decode Base64
        convert      Convert configs
        tls          TLS tools
        uuid         Generate UUIDv4 or UUIDv5 (VLESS)
        x25519       Generate key pair for X25519 key exchange (REALITY, VLESS Encryption)
        wg           Generate key pair for X25519 key exchange (WireGuard)
        mldsa65      Generate key pair for ML-DSA-65 post-quantum signature (REALITY)
        mlkem768     Generate key pair for ML-KEM-768 post-quantum key exchange (VLESS Encryption)
        vlessenc     Generate decryption/encryption json pair (VLESS Encryption)

Use "xray help <command>" for more information about a command.

[fake engine ${v}]
`;

function fakePem(kind: string): string {
  const body = b64(randomBytes(96), false).match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN ${kind}-----\n${body}\n-----END ${kind}-----\n`;
}

async function fakeRun(args: string[], opts: RunOptions): Promise<Omit<RunResult, 'durationMs' | 'tag'>> {
  const cwd = opts.cwd ?? WORK_DIR;
  const files = opts.files ?? {};
  const ok = (stdout: string, written: Record<string, Uint8Array> = {}) => ({ exitCode: 0, stdout, stderr: '', files: written });
  const fail = (stderr: string, exitCode = 1) => ({ exitCode, stdout: '', stderr: stderr.endsWith('\n') ? stderr : `${stderr}\n`, files: {} });
  const [cmd = 'help', ...rest] = args;
  const v = version(opts.tag);

  switch (cmd) {
    case 'version':
      return ok(`Xray ${v} (Xray, Penetrates Everything.) fake0000 (go1.27.0 js/wasm)\nA unified platform for anti-censorship.\n${FAKE_NOTICE}\n`);
    case 'help':
    case '-h':
    case '--help':
      return ok(ROOT_HELP(v));
    case 'uuid': {
      const { flags } = parseFlags(rest);
      const input = flags.get('i')?.[0];
      if (input === undefined || input === '') return ok(`${crypto.randomUUID()}\n`);
      if (input.length > 30) return fail(`invalid UUID: ${input}`);
      return ok(`${await xrayUuidFromString(input)}\n`);
    }
    case 'x25519':
    case 'wg': {
      const url = cmd === 'x25519' && !rest.includes('--std-encoding') && !rest.includes('-std-encoding');
      const [priv, pub, hash] = [randomBytes(32), randomBytes(32), randomBytes(32)].map(b => b64(b, url));
      return ok(`PrivateKey: ${priv}\nPassword (PublicKey): ${pub}\nHash32: ${hash}\n`);
    }
    case 'mldsa65':
      return ok(`Seed: ${b64(randomBytes(32), true)}\nVerify: ${b64(randomBytes(1952), true)}\n`);
    case 'mlkem768':
      return ok(`Seed: ${b64(randomBytes(64), true)}\nClient: ${b64(randomBytes(1184), true)}\nHash32: ${b64(randomBytes(32), true)}\n`);
    case 'vlessenc': {
      const x = () => b64(randomBytes(32), true);
      return ok(
        'Choose one Authentication to use, do not mix them. Ephemeral key exchange is Post-Quantum safe anyway.\n\n' +
          `Authentication: X25519, not Post-Quantum\n"decryption": "mlkem768x25519plus.native.600s.${x()}"\n"encryption": "mlkem768x25519plus.native.0rtt.${x()}"\n\n` +
          `Authentication: ML-KEM-768, Post-Quantum\n"decryption": "mlkem768x25519plus.native.600s.${b64(randomBytes(64), true)}"\n"encryption": "mlkem768x25519plus.native.0rtt.${b64(randomBytes(1184), true)}"\n`,
      );
    }
    case 'tls': {
      const [sub, ...more] = rest;
      if (sub === 'ping') return fail('tls ping needs the network, which the browser build does not have.');
      if (sub !== 'cert') return fail(`xray tls: unknown command "${sub ?? ''}"\nRun 'xray help tls' for usage.`, 2);
      const { flags } = parseFlags(more, ['ca', 'json']);
      const cert = fakePem('CERTIFICATE');
      const key = fakePem('PRIVATE KEY');
      const out: Record<string, Uint8Array> = {};
      const file = flags.get('file')?.[0];
      if (file) {
        out[abs(cwd, `${file}.crt`)] = enc.encode(cert);
        out[abs(cwd, `${file}.key`)] = enc.encode(key);
      }
      const json = flags.get('json')?.[0] !== 'false'
        ? `${JSON.stringify({ certificate: cert.trim().split('\n'), key: key.trim().split('\n') }, null, 2)}\n`
        : '';
      return ok(json, out);
    }
    case 'api':
      return fail('xray api talks to a running Xray over the network, which the browser build does not have.');
    case 'run': {
      const { flags } = parseFlags(rest, ['test', 'dump']);
      const config = flags.get('c')?.[0] ?? flags.get('config')?.[0];
      if (!config) return fail('Failed to start: main: failed to load config files: [] > no config file specified', 23);
      const data = files[abs(cwd, config)];
      if (!data) return fail(`Failed to start: main: failed to load config files: [${config}] > open ${abs(cwd, config)}: no such file or directory`, 23);
      const r = fakeCheck(dec.decode(data), opts.tag, files);
      if (!flags.has('test') && !flags.has('dump')) return fail('xray run without -test would start the proxy; the browser build only loads configs (use -test).');
      if (r.verdict === 'ok') return ok(`Xray ${v} (Xray, Penetrates Everything.) fake0000 (go1.27.0 js/wasm)\n${FAKE_NOTICE}\nConfiguration OK.\n`);
      return fail(`Xray ${v} (Xray, Penetrates Everything.)\n${FAKE_NOTICE}\nFailed to start: main: failed to load config files: [${config}] > ${r.error}`, 23);
    }
    case 'convert':
    case 'base64':
      return fail(`[fake engine] "xray ${cmd}" is not simulated; the real core runs it.`);
    default:
      return fail(`xray: unknown command "${cmd}"\nRun 'xray help' for usage.`, 2);
  }
}

export function createFakeXray(_opts: Partial<XrayOptions> = {}, fake: FakeOptions = {}): Xray {
  const downloadMs = fake.downloadMs ?? 900;
  const builds: BuildInfo[] = (fake.builds ?? FAKE_BUILDS).map((b, i) => ({
    ...b,
    version: version(b.tag),
    file: `${b.tag}.xray.wasm.gz`,
    size: 41_000_000 + i * 50_000,
    gzip: 12_400_000 + i * 20_000,
    sha256: `fake${i}`.padEnd(64, '0'),
  }));
  const manifest: Manifest = { builds, wasmExec: { file: 'wasm_exec.js', sha256: '0'.repeat(64), go: 'go1.27.0' } };
  const prepared = new Set<string>();
  const known = (tag: string) => builds.some(b => b.tag === tag);

  return {
    async manifest() {
      return manifest;
    },
    async prepare(tag, onProgress) {
      if (!known(tag)) throw new Error(`no build for ${tag} in the manifest`);
      if (prepared.has(tag)) return;
      const total = builds.find(b => b.tag === tag)?.gzip ?? 1;
      const steps = downloadMs > 0 ? 12 : 1;
      for (let i = 1; i <= steps; i++) {
        if (downloadMs > 0) await sleep(downloadMs / steps);
        onProgress?.(Math.round((total * i) / steps), total);
      }
      prepared.add(tag);
    },
    async check(configJson: string, opts: CallOptions) {
      const started = performance.now();
      if (!known(opts.tag)) return { verdict: 'unavailable', ok: false, tag: opts.tag, error: `no build for ${opts.tag}`, durationMs: 0, log: [] };
      const r = fakeCheck(configJson, opts.tag, opts.files ?? {});
      return { ...r, tag: opts.tag, coreVersion: version(opts.tag), durationMs: performance.now() - started + 180 };
    },
    async run(args: string[], opts: RunOptions) {
      const started = performance.now();
      if (!known(opts.tag)) return { exitCode: -1, stdout: '', stderr: `no build for ${opts.tag}\n`, files: {}, durationMs: 0, tag: opts.tag };
      const r = await fakeRun(args, opts);
      return { ...r, tag: opts.tag, durationMs: performance.now() - started + 120 };
    },
    dispose() {
      prepared.clear();
    },
  };
}
