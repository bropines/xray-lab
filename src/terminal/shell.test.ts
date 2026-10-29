import { describe, expect, test } from 'bun:test';
import { Engine } from '../engine/engine';
import { createFakeXray } from '../engine/fake';
import { SessionFs } from '../fs/session-fs';
import { Shell } from './shell';

// eslint-disable-next-line no-control-regex
const plain = (s: string) => s.replace(/[^\n]*\r\x1b\[K/g, '').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');

function setup() {
  const engine = new Engine({ kind: 'fake', baseUrl: 'http://localhost/', create: async () => createFakeXray({}, { downloadMs: 0 }) });
  const fs = new SessionFs(null);
  let out = '';
  let cleared = 0;
  const downloads: string[] = [];
  const edits: string[] = [];
  let toUpload: { name: string; data: Uint8Array }[] = [];
  const shell = new Shell({
    engine,
    fs,
    tag: 'v26.10.21',
    io: { write: s => { out += s; }, clear: () => { cleared++; } },
    host: {
      upload: async () => toUpload,
      download: name => downloads.push(name),
      edit: path => edits.push(path),
    },
  });
  return {
    shell,
    fs,
    engine,
    run: async (line: string) => {
      out = '';
      const code = await shell.execute(line);
      return { code, out: plain(out) };
    },
    cleared: () => cleared,
    downloads,
    edits,
    setUpload: (f: typeof toUpload) => { toUpload = f; },
  };
}

describe('Shell builtins', () => {
  test('echo, redirect, cat, ls, rm', async () => {
    const s = setup();
    expect((await s.run('echo hello world')).out).toBe('hello world\n');
    await s.run('echo one > notes.txt');
    await s.run('echo two >> notes.txt');
    expect((await s.run('cat notes.txt')).out).toBe('one\ntwo\n');
    expect((await s.run('ls')).out).toContain('notes.txt');
    expect((await s.run('rm notes.txt')).code).toBe(0);
    expect((await s.run('cat notes.txt')).code).toBe(1);
    expect((await s.run('rm nope')).code).toBe(1);
    expect((await s.run('rm -f nope')).code).toBe(0);
  });

  test('cp, mv, cd, pwd', async () => {
    const s = setup();
    s.fs.write('/work/a.json', '{}');
    await s.run('cp a.json b.json');
    await s.run('mv b.json c.json');
    expect(s.fs.exists('/work/b.json')).toBe(false);
    expect(s.fs.readText('/work/c.json')).toBe('{}');
    s.fs.write('/usr/share/xray/geoip.dat', new Uint8Array([10, 1, 2]));
    expect((await s.run('cd /usr/share/xray')).code).toBe(0);
    expect((await s.run('pwd')).out).toBe('/usr/share/xray\n');
    expect((await s.run('cd /nowhere')).code).toBe(1);
  });

  test('cat refuses binary files', async () => {
    const s = setup();
    s.fs.write('/work/x.bin', new Uint8Array([0, 1, 2, 3]));
    const r = await s.run('cat x.bin');
    expect(r.code).toBe(1);
    expect(r.out).toContain('binary file');
  });

  test('upload puts geo files where the core looks', async () => {
    const s = setup();
    s.setUpload([
      { name: 'geosite.dat', data: new Uint8Array([10, 1]) },
      { name: 'my.json', data: new TextEncoder().encode('{}') },
    ]);
    await s.run('upload');
    expect(s.fs.exists('/usr/share/xray/geosite.dat')).toBe(true);
    expect(s.fs.exists('/work/my.json')).toBe(true);
  });

  test('download and edit ask the page', async () => {
    const s = setup();
    s.fs.write('/work/config.json', '{}');
    await s.run('download config.json');
    expect(s.downloads).toEqual(['config.json']);
    await s.run('edit new.json');
    expect(s.edits).toEqual(['/work/new.json']);
    expect(s.fs.exists('/work/new.json')).toBe(true);
  });

  test('unknown commands, syntax errors, history, clear', async () => {
    const s = setup();
    expect((await s.run('frobnicate')).code).toBe(127);
    expect((await s.run('echo "open')).code).toBe(2);
    await s.run('clear');
    expect(s.cleared()).toBe(1);
    expect(s.shell.history).toEqual(['frobnicate', 'echo "open', 'clear']);
  });

  test('use and versions', async () => {
    const s = setup();
    expect((await s.run('use 26.7.28')).out).toBe('xray → v26.7.28\n');
    expect(s.shell.tag).toBe('v26.7.28');
    expect((await s.run('use 1.0.0')).code).toBe(1);
    const v = await s.run('versions');
    expect(v.out).toContain('v26.10.21');
    expect(v.out).toContain('withdrawn');
  });
});

describe('Shell xray', () => {
  test('runs the chosen core and a pinned one', async () => {
    const s = setup();
    expect((await s.run('xray version')).out).toContain('Xray 26.10.21');
    expect((await s.run('xray@26.7.28 version')).out).toContain('Xray 26.7.28');
    expect((await s.run('xray@9.9.9 version')).code).toBe(127);
  });

  test('run -test sees the session files', async () => {
    const s = setup();
    s.fs.write('/work/config.json', '{"outbounds":[{"protocol":"freedom"}]}');
    const ok = await s.run('xray run -test -c config.json');
    expect(ok.code).toBe(0);
    expect(ok.out).toContain('Configuration OK.');
    const missing = await s.run('xray run -test -c nope.json');
    expect(missing.code).toBe(23);
  });

  test('files a command writes land in the file system', async () => {
    const s = setup();
    const r = await s.run('xray tls cert -domain=example.com -file=cert');
    expect(r.code).toBe(0);
    expect(r.out).toContain('wrote cert.crt, cert.key');
    expect(s.fs.readText('/work/cert.crt')).toContain('BEGIN CERTIFICATE');
  });

  test('stdout can be redirected', async () => {
    const s = setup();
    const r = await s.run('xray x25519 > keys.txt');
    expect(r.out).toBe('');
    expect(s.fs.readText('/work/keys.txt')).toContain('PrivateKey:');
  });

  test('the prompt shows the version and the last exit status', async () => {
    const s = setup();
    expect(plain(s.shell.prompt())).toBe('xray 26.10.21 ~ ❯ ');
    await s.run('cd /usr');
    expect(plain(s.shell.prompt())).toContain('/usr');
  });

  test('completions use the session files', () => {
    const s = setup();
    s.fs.write('/work/config.json', '{}');
    expect(s.shell.completions('cat con').candidates).toEqual(['config.json']);
  });
});

describe('download progress', () => {
  test('stays on one row of a narrow terminal', async () => {
    const engine = new Engine({ kind: 'fake', baseUrl: 'http://localhost/', create: async () => createFakeXray({}, { downloadMs: 60 }) });
    let out = '';
    const shell = new Shell({
      engine,
      fs: new SessionFs(null),
      tag: 'v26.10.21',
      io: { write: s => { out += s; }, clear: () => {}, cols: () => 30 },
      host: { upload: async () => [], download: () => {}, edit: () => {} },
    });
    await shell.execute('xray version');
    const frames = out.split('\r\x1b[K').slice(1, -1).map(plain).filter(f => f && !f.includes('\n'));
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames) expect(f.length).toBeLessThan(30);
  });
});
