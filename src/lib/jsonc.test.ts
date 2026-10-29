import { describe, expect, test } from 'bun:test';
import { errorOffset, jsonProblem, stripJsonc } from './jsonc';

describe('stripJsonc', () => {
  test('plain JSON is untouched', () => {
    const r = stripJsonc('{"a": [1, 2]}');
    expect(r.json).toBe('{"a": [1, 2]}');
    expect(r.changed).toBe(false);
  });

  test('removes line, block and hash comments, keeping lines', () => {
    const src = '{\n  // note\n  "a": 1, /* x\n y */ "b": 2 # tail\n}';
    const r = stripJsonc(src);
    expect(JSON.parse(r.json)).toEqual({ a: 1, b: 2 });
    expect(r.comments).toBe(3);
    expect(r.json.split('\n').length).toBe(src.split('\n').length);
    expect(r.json.length).toBe(src.length);
  });

  test('leaves comment-like text inside strings alone', () => {
    const src = '{"url": "http://example.com/a", "s": "/* no */", "h": "# no", "q": "a\\"//b"}';
    const r = stripJsonc(src);
    expect(r.changed).toBe(false);
    expect(JSON.parse(r.json)).toEqual({ url: 'http://example.com/a', s: '/* no */', h: '# no', q: 'a"//b' });
  });

  test('removes trailing commas, also with comments in between', () => {
    const r = stripJsonc('{"a": [1, 2, ], "b": {"c": 1, // c\n }, }');
    expect(JSON.parse(r.json)).toEqual({ a: [1, 2], b: { c: 1 } });
    expect(r.trailingCommas).toBe(3);
  });

  test('keeps a comma that separates values', () => {
    expect(JSON.parse(stripJsonc('[1, /* two */ 2]').json)).toEqual([1, 2]);
  });

  test('drops a BOM', () => {
    const r = stripJsonc('﻿{"a":1}');
    expect(r.json).toBe('{"a":1}');
    expect(r.changed).toBe(true);
  });
});

describe('jsonProblem', () => {
  test('null for valid JSON', () => {
    expect(jsonProblem('{"a":1}')).toBeNull();
  });

  test('reports a 1-based line and column', () => {
    const p = jsonProblem('{\n  "a": 1\n  "b": 2\n}');
    expect(p?.line).toBe(3);
    expect(p?.column).toBeGreaterThanOrEqual(1);
  });
});

describe('errorOffset', () => {
  test('finds where a parser would stop', () => {
    expect(errorOffset('{"a":1}')).toBeUndefined();
    expect(errorOffset('{"a": 1 "b": 2}')).toBe(8);
    expect(errorOffset('[1,]')).toBe(3);
    expect(errorOffset('')).toBe(0);
    expect(errorOffset('{"a": tru}')).toBe(6);
    expect(errorOffset('{"a": "x\\q"}')).toBe(9);
    expect(errorOffset('{"a": 1} x')).toBe(9);
  });
});
