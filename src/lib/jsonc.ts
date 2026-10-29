/**
 * JSON with comments and trailing commas → JSON.
 *
 * Configs are often written with `//` notes and a stray comma, which the core
 * (comments) or no JSON parser at all (commas) accepts. The checker hands the
 * core plain JSON, and says what it removed so nobody is surprised.
 *
 * Comments become spaces — newlines kept — so a line:column the parser or the
 * core reports still points at the same place in what the person pasted.
 * Strings are left alone, escapes included (`"http://x"` is not a comment).
 * Xray also reads `#` line comments; those are stripped too.
 */
export interface StripResult {
  json: string;
  comments: number;
  trailingCommas: number;
  changed: boolean;
}

export function stripJsonc(input: string): StripResult {
  const out: string[] = [];
  let comments = 0;
  let trailingCommas = 0;
  let i = 0;
  const n = input.length;
  // Index in `out` of the last comma seen outside strings, while only
  // whitespace and comments have followed it.
  let pendingComma = -1;

  const blank = (s: string) => s.replace(/[^\n\r]/g, ' ');

  // A BOM is not JSON.
  if (input.charCodeAt(0) === 0xfeff) i = 1;

  while (i < n) {
    const c = input[i] ?? '';
    const next = input[i + 1] ?? '';
    if (c === '"') {
      let j = i + 1;
      while (j < n && input[j] !== '"') {
        if (input[j] === '\\') j++;
        else if (input[j] === '\n') break; // unterminated: let the parser complain
        j++;
      }
      out.push(input.slice(i, j + 1));
      i = j + 1;
      pendingComma = -1;
      continue;
    }
    if ((c === '/' && next === '/') || c === '#') {
      let j = i;
      while (j < n && input[j] !== '\n' && input[j] !== '\r') j++;
      out.push(blank(input.slice(i, j)));
      comments++;
      i = j;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = input.indexOf('*/', i + 2);
      const j = end === -1 ? n : end + 2;
      out.push(blank(input.slice(i, j)));
      comments++;
      i = j;
      continue;
    }
    if (c === ',') {
      pendingComma = out.length;
      out.push(c);
      i++;
      continue;
    }
    if (c === '}' || c === ']') {
      if (pendingComma !== -1) {
        out[pendingComma] = ' ';
        trailingCommas++;
      }
      pendingComma = -1;
      out.push(c);
      i++;
      continue;
    }
    if (!/\s/.test(c)) pendingComma = -1;
    out.push(c);
    i++;
  }

  const json = out.join('');
  return { json, comments, trailingCommas, changed: comments > 0 || trailingCommas > 0 || input.charCodeAt(0) === 0xfeff };
}

/**
 * Offset of the first character a JSON parser would reject, or undefined when
 * the text parses. A small recursive-descent reader that only tracks where it
 * is; used when the engine's error message carries no position.
 */
export function errorOffset(text: string): number | undefined {
  let i = 0;
  const n = text.length;
  class Stop {
    constructor(readonly at: number) {}
  }
  const ws = () => {
    while (i < n && ' \t\n\r'.includes(text[i] as string)) i++;
  };
  const fail = (): never => {
    throw new Stop(Math.min(i, n));
  };
  const expect = (c: string) => {
    if (text[i] !== c) fail();
    i++;
  };
  const str = () => {
    expect('"');
    while (i < n && text[i] !== '"') {
      const c = text.charCodeAt(i);
      if (c < 0x20) fail();
      if (text[i] === '\\') {
        i++;
        if (text[i] === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 1, i + 5))) fail();
          i += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(text[i] ?? 'x')) fail();
      }
      i++;
    }
    expect('"');
  };
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m || !m[0]) fail();
    i += (m as RegExpExecArray)[0].length;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        str();
        ws();
        expect(':');
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        expect('}');
        return;
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        expect(']');
        return;
      }
    }
    if (c === '"') return str();
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return;
      }
    }
    num();
  };
  try {
    value();
    ws();
    if (i < n) fail();
    return undefined;
  } catch (e) {
    if (e instanceof Stop) return e.at;
    throw e;
  }
}

export interface JsonProblem {
  message: string;
  line?: number;
  column?: number;
}

/** Where `JSON.parse` fails, as 1-based line and column; null when it parses. */
export function jsonProblem(json: string): JsonProblem | null {
  try {
    JSON.parse(json);
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    let pos: number | undefined;
    const at = /position (\d+)/i.exec(message);
    if (at) pos = Number(at[1]);
    const lc = /line (\d+) column (\d+)/i.exec(message);
    if (lc) return { message, line: Number(lc[1]), column: Number(lc[2]) };
    // Safari (and Bun) say what is wrong but not where: find it ourselves.
    pos ??= errorOffset(json);
    if (pos === undefined) return { message };
    const before = json.slice(0, pos);
    const line = before.split('\n').length;
    const column = pos - before.lastIndexOf('\n');
    return { message, line, column };
  }
}
