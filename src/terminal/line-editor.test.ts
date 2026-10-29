import { describe, expect, test } from 'bun:test';
import { complete } from './completion';
import { LineEditor, visibleLength } from './line-editor';

function setup(history: string[] = [], cols = 80) {
  let out = '';
  const editor = new LineEditor({
    write: s => {
      out += s;
    },
    prompt: () => '\x1b[36m~\x1b[0m ❯ ',
    cols: () => cols,
    complete: before => complete(before, { files: ['config.json', 'cert.crt'], tags: ['v26.10.21'] }),
    history: () => history,
  });
  editor.start();
  return { editor, out: () => out };
}

describe('LineEditor', () => {
  test('types and submits a line', () => {
    const { editor } = setup();
    expect(editor.feed('xray version')).toEqual([]);
    expect(editor.feed('\r')).toEqual([{ type: 'submit', line: 'xray version' }]);
    expect(editor.buffer).toBe('');
  });

  test('a paste with several lines submits each', () => {
    const { editor } = setup();
    expect(editor.feed('echo a\r\necho b\r')).toEqual([
      { type: 'submit', line: 'echo a' },
      { type: 'submit', line: 'echo b' },
    ]);
  });

  test('cursor movement and editing', () => {
    const { editor } = setup();
    editor.feed('xray versio');
    editor.feed('\x1b[D\x1b[D'); // left twice
    editor.feed('X');
    expect(editor.buffer).toBe('xray versXio');
    editor.feed('\x7f'); // backspace
    expect(editor.buffer).toBe('xray versio');
    editor.feed('\x05n'); // Ctrl+E, then n
    expect(editor.buffer).toBe('xray version');
    editor.feed('\x17'); // Ctrl+W
    expect(editor.buffer).toBe('xray ');
    editor.feed('\x15'); // Ctrl+U
    expect(editor.buffer).toBe('');
  });

  test('history with up and down keeps the draft', () => {
    const { editor } = setup(['xray version', 'ls']);
    editor.feed('dra');
    editor.feed('\x1b[A');
    expect(editor.buffer).toBe('ls');
    editor.feed('\x1b[A');
    expect(editor.buffer).toBe('xray version');
    editor.feed('\x1b[B\x1b[B');
    expect(editor.buffer).toBe('dra');
  });

  test('Tab completes a single match and extends a common prefix', () => {
    const { editor } = setup();
    editor.feed('xray x2\t');
    expect(editor.buffer).toBe('xray x25519 ');
    editor.feed('\x15xray ml\t');
    expect(editor.buffer).toBe('xray ml');
  });

  test('Tab lists ambiguous matches and redraws the line', () => {
    const { editor, out } = setup();
    editor.feed('xray ml\t\t');
    expect(out()).toContain('mldsa65');
    expect(out()).toContain('mlkem768');
    expect(editor.buffer).toBe('xray ml');
  });

  test('Ctrl+C and Ctrl+L are events', () => {
    const { editor } = setup();
    editor.feed('abc');
    expect(editor.feed('\x03')).toEqual([{ type: 'interrupt' }]);
    expect(editor.buffer).toBe('');
    expect(editor.feed('\x0c')).toEqual([{ type: 'clear' }]);
  });

  test('visibleLength ignores colour codes', () => {
    expect(visibleLength('\x1b[36m~\x1b[0m ❯ ')).toBe(4);
  });

  test('a line longer than the terminal moves the cursor up to redraw', () => {
    const { editor, out } = setup([], 20);
    editor.feed('xray run -test -c config.json');
    const before = out().length;
    editor.feed('\x1b[H'); // Home
    expect(out().slice(before)).toContain('\x1b[1A');
  });
});
