import { describe, expect, test } from 'bun:test';
import type { Xray } from './contract';
import { CancelledError, Engine } from './engine';
import { FAKE_NOTICE, createFakeXray } from './fake';

const makeEngine = (xray: Xray = createFakeXray({}, { downloadMs: 0 })) =>
  new Engine({ kind: 'fake', baseUrl: 'http://localhost/xray-wasm/', create: async () => xray });

describe('Engine', () => {
  test('loads the manifest newest first and marks nothing as cached', async () => {
    const engine = makeEngine();
    await engine.loadManifest();
    const s = engine.store.getState();
    expect(s.builds[0]?.tag).toBe('v26.10.21');
    expect(s.builds.length).toBe(16);
    expect(s.tags['v26.7.28']?.phase).toBe('remote');
    expect(engine.downloadBytes(['v26.7.28', 'v26.3.27'])).toBeGreaterThan(20_000_000);
  });

  test('prepare reports progress and ends ready; a ready core costs no download', async () => {
    const engine = makeEngine();
    await engine.loadManifest();
    const seen: number[] = [];
    const unsub = engine.store.subscribe(s => {
      const t = s.tags['v26.7.28'];
      if (t?.phase === 'downloading') seen.push(t.loaded);
    });
    await engine.prepare('v26.7.28');
    unsub();
    expect(seen.length).toBeGreaterThan(0);
    expect(engine.store.getState().tags['v26.7.28']?.phase).toBe('ready');
    expect(engine.downloadBytes(['v26.7.28'])).toBe(0);
  });

  test('check returns the verdict (fake: ok, error, inconclusive)', async () => {
    const engine = makeEngine();
    await engine.loadManifest();
    const ok = await engine.check('{"outbounds":[{"protocol":"freedom"}]}', 'v26.10.21');
    expect(ok.verdict).toBe('ok');
    expect(ok.log).toContain(FAKE_NOTICE);
    const bad = await engine.check('{"outbounds": [', 'v26.10.21');
    expect(bad.verdict).toBe('error');
    const geo = await engine.check('{"routing":{"rules":[{"ip":["geoip:private"],"outboundTag":"x"}]}}', 'v26.10.21');
    expect(geo.verdict).toBe('inconclusive');
    expect(geo.missingFiles).toEqual(['/usr/share/xray/geoip.dat']);
  });

  test('a library failure becomes `unavailable`, not an exception', async () => {
    const broken: Xray = {
      manifest: async () => ({ builds: [], wasmExec: { file: 'wasm_exec.js', sha256: '', go: '' } }),
      prepare: async () => {
        throw new Error('no such build');
      },
      check: async () => {
        throw new Error('unreachable');
      },
      run: async () => {
        throw new Error('unreachable');
      },
      dispose: () => {},
    };
    const engine = makeEngine(broken);
    const r = await engine.check('{}', 'v1.0.0');
    expect(r.verdict).toBe('unavailable');
    expect(r.error).toBe('no such build');
    const run = await engine.run(['version'], { tag: 'v1.0.0' });
    expect(run.exitCode).toBe(-1);
    expect(engine.store.getState().tags['v1.0.0']?.phase).toBe('error');
  });

  test('cancel aborts a download in flight with CancelledError', async () => {
    const engine = makeEngine(createFakeXray({}, { downloadMs: 200 }));
    await engine.loadManifest();
    const p = engine.check('{}', 'v26.9.9');
    await new Promise(r => setTimeout(r, 20));
    engine.cancel();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(engine.store.getState().tags['v26.9.9']?.phase).toBe('remote');
  });

  test('calls run one at a time', async () => {
    let active = 0;
    let maxActive = 0;
    const fake = createFakeXray({}, { downloadMs: 0 });
    const xray: Xray = {
      ...fake,
      run: async (args, opts) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise(r => setTimeout(r, 10));
        active--;
        return fake.run(args, opts);
      },
    };
    const engine = makeEngine(xray);
    await engine.loadManifest();
    await Promise.all([1, 2, 3].map(() => engine.run(['uuid'], { tag: 'v26.10.21' })));
    expect(maxActive).toBe(1);
  });
});

describe('fake uuid -i', () => {
  test('matches what the real core printed for the same text', async () => {
    // `xray uuid -i "my name"` on v26.10.21 (xray-wasm), recorded in the browser.
    const { xrayUuidFromString } = await import('./fake');
    expect(await xrayUuidFromString('my name')).toBe('e0620cf6-39ec-5866-9a28-eb85869c2f6f');
  });
});
