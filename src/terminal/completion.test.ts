import { describe, expect, test } from 'bun:test';
import { commonPrefix, complete, type CompletionContext } from './completion';

const ctx: CompletionContext = {
  files: ['config.json', 'cert.crt', 'cert.key', '/usr/share/xray/geoip.dat'],
  dirs: ['/usr', '/usr/share'],
  tags: ['v26.10.21', 'v26.7.28'],
};

const c = (line: string) => complete(line, ctx).candidates;

describe('complete', () => {
  test('first word: builtins and xray spellings', () => {
    expect(c('xr')).toEqual(['xray', 'xray@26.10.21', 'xray@26.7.28']);
    expect(c('he')).toEqual(['help']);
    expect(c('ve')).toEqual(['versions']);
  });

  test('xray subcommands, then their subcommands', () => {
    expect(c('xray ')).toContain('x25519');
    expect(c('xray ml')).toEqual(['mldsa65', 'mlkem768']);
    expect(c('xray tls ')).toEqual(['cert', 'ech', 'hash', 'ping']);
    expect(c('xray@26.7.28 conv')).toEqual(['convert']);
    expect(c('xray help vl')).toEqual(['vlessenc']);
  });

  test('flags', () => {
    expect(c('xray run -')).toEqual(['-c', '-confdir', '-config', '-dump', '-format', '-test']);
    expect(c('xray x25519 --')).toEqual(['--std-encoding']);
    expect(c('xray tls cert -d')).toEqual(['-domain']);
  });

  test('file names where files go', () => {
    expect(c('xray run -test -c ')).toEqual(['/usr/', '/usr/share/', '/usr/share/xray/geoip.dat', 'cert.crt', 'cert.key', 'config.json']);
    expect(c('xray run -test -c co')).toEqual(['config.json']);
    expect(c('cat cert.')).toEqual(['cert.crt', 'cert.key']);
    expect(c('xray x25519 > ce')).toEqual(['cert.crt', 'cert.key']);
  });

  test('versions for `use`', () => {
    expect(c('use 26.7')).toEqual(['26.7.28']);
    expect(c('use ')).toEqual(['26.10.21', '26.7.28', 'latest']);
  });

  test('reports where the word starts', () => {
    expect(complete('cat co', ctx).start).toBe(4);
    expect(complete('cat ', ctx).start).toBe(4);
  });

  test('commonPrefix', () => {
    expect(commonPrefix(['mldsa65', 'mlkem768'])).toBe('ml');
    expect(commonPrefix(['a'])).toBe('a');
    expect(commonPrefix([])).toBe('');
  });
});
