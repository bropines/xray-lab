import { describe, expect, test } from 'bun:test';
import { formatCommand, parseLine, quoteArg, tokenize } from './parser';

const args = (line: string) => {
  const r = parseLine(line);
  if (!r.ok) throw new Error(r.error);
  return r.command;
};

describe('parseLine', () => {
  test('splits words', () => {
    expect(args('xray  run -test   -c config.json').args).toEqual(['xray', 'run', '-test', '-c', 'config.json']);
  });

  test('quotes and escapes', () => {
    expect(args(`xray uuid -i "my name"`).args).toEqual(['xray', 'uuid', '-i', 'my name']);
    expect(args(`echo 'a "b" c'`).args).toEqual(['echo', 'a "b" c']);
    expect(args(`echo "say \\"hi\\""`).args).toEqual(['echo', 'say "hi"']);
    expect(args(`echo a\\ b`).args).toEqual(['echo', 'a b']);
    expect(args(`echo pre"mid"'post'`).args).toEqual(['echo', 'premidpost']);
    expect(args(`echo ""`).args).toEqual(['echo', '']);
  });

  test('comments', () => {
    expect(args('xray version # what runs').args).toEqual(['xray', 'version']);
    expect(args('echo a#b').args).toEqual(['echo', 'a#b']);
  });

  test('redirection', () => {
    const c = args('xray x25519 > keys.txt');
    expect(c.args).toEqual(['xray', 'x25519']);
    expect(c.stdout).toEqual({ path: 'keys.txt', append: false });
    expect(args('echo hi >> log').stdout).toEqual({ path: 'log', append: true });
    expect(args('xray base64 encode stdin: < in.txt').stdin).toBe('in.txt');
    expect(args('echo ">"').args).toEqual(['echo', '>']);
  });

  test('refuses what it does not support', () => {
    expect(parseLine('xray version | grep Xray').ok).toBe(false);
    expect(parseLine('echo a; echo b').ok).toBe(false);
    expect(parseLine('echo "open').ok).toBe(false);
    expect(parseLine('echo >').ok).toBe(false);
  });
});

describe('tokenize', () => {
  test('knows whether a new word has started', () => {
    expect(tokenize('xray ').trailingSpace).toBe(true);
    expect(tokenize('xray').trailingSpace).toBe(false);
    expect(tokenize('').trailingSpace).toBe(true);
    expect(tokenize('echo "a ').unterminated).toBe('"');
  });
});

describe('quoteArg', () => {
  test('round-trips through the parser', () => {
    for (const a of ['plain', 'my name', "it's", '', '-domain=example.com', 'a"b', '$HOME']) {
      expect(args(`echo ${quoteArg(a)}`).args[1]).toBe(a);
    }
    expect(formatCommand(['uuid', '-i', 'my name'])).toBe("uuid -i 'my name'");
  });
});
