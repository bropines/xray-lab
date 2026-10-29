import { describe, expect, test } from 'bun:test';
import { SessionFs, displayPath, looksLikeText, resolvePath } from './session-fs';

function memoryStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('paths', () => {
  test('resolve against /work, with . .. ~ and extra slashes', () => {
    expect(resolvePath('config.json')).toBe('/work/config.json');
    expect(resolvePath('./a//b.json')).toBe('/work/a/b.json');
    expect(resolvePath('../usr/share/xray/geoip.dat')).toBe('/usr/share/xray/geoip.dat');
    expect(resolvePath('~/x')).toBe('/work/x');
    expect(resolvePath('/etc/ssl/cert.pem')).toBe('/etc/ssl/cert.pem');
    expect(resolvePath('c', '/usr/share')).toBe('/usr/share/c');
    expect(displayPath('/work/a.json')).toBe('a.json');
    expect(displayPath('/usr/share/xray/geoip.dat')).toBe('/usr/share/xray/geoip.dat');
  });
});

describe('SessionFs', () => {
  test('write, read, list, remove', () => {
    const fs = new SessionFs(null);
    fs.write('config.json', '{}');
    fs.write('/usr/share/xray/geoip.dat', new Uint8Array([10, 2]));
    expect(fs.readText('/work/config.json')).toBe('{}');
    expect(fs.list('/work').map(e => e.name)).toEqual(['config.json']);
    expect(fs.list('/usr').map(e => [e.name, e.dir])).toEqual([['share', true]]);
    expect(fs.list('/').map(e => e.name)).toEqual(['usr', 'work']);
    expect(fs.isDir('/usr/share')).toBe(true);
    expect(fs.isDir('/work/config.json')).toBe(false);
    expect(Object.keys(fs.snapshot()).sort()).toEqual(['/usr/share/xray/geoip.dat', '/work/config.json']);
    expect(fs.remove('config.json')).toBe(true);
    expect(fs.exists('config.json')).toBe(false);
  });

  test('keeps small /work files across a reload, nothing else', () => {
    const storage = memoryStorage();
    const a = new SessionFs(storage);
    a.write('config.json', '{"a":1}');
    a.write('/usr/share/xray/geosite.dat', new Uint8Array([10, 1]));
    a.write('big.bin', new Uint8Array(600 * 1024));
    a.persistNow();
    const b = new SessionFs(storage);
    expect(b.readText('config.json')).toBe('{"a":1}');
    expect(b.exists('/usr/share/xray/geosite.dat')).toBe(false);
    expect(b.exists('big.bin')).toBe(false);
  });

  test('broken storage is an empty file system, not an error', () => {
    const fs = new SessionFs({ getItem: () => '{not json', setItem: () => { throw new Error('quota'); } });
    expect(fs.paths()).toEqual([]);
    fs.write('a', 'b');
    fs.persistNow();
    expect(fs.readText('a')).toBe('b');
  });

  test('looksLikeText', () => {
    expect(looksLikeText(new TextEncoder().encode('{"ключ": 1}'))).toBe(true);
    expect(looksLikeText(new Uint8Array([10, 0, 3]))).toBe(false);
  });
});
