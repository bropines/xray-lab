/**
 * The shell's command-line grammar: a small, honest subset of sh.
 *
 *   - words split on whitespace;
 *   - '…' is literal, "…" allows \" \\ \$ \` escapes, a backslash outside
 *     quotes escapes the next character;
 *   - `#` at the start of a word starts a comment;
 *   - `> file`, `>> file` send stdout to a file, `< file` reads stdin from one.
 *
 * No pipes, variables, globbing or `&&` — the parser refuses `|`, `&` and `;`
 * instead of silently treating them as words.
 */
export interface Token {
  value: string;
  /** Offset in the line where the token starts, quotes included. */
  start: number;
  end: number;
  /** An operator (`>`, `>>`, `<`, `|`, `&`, `;`) rather than a word. */
  op?: boolean;
  quoted?: boolean;
}

export interface Tokenized {
  tokens: Token[];
  /** Set when the line ends inside a quote. */
  unterminated?: '"' | "'";
  /** The line ends right after whitespace (or is empty): the next word has not started. */
  trailingSpace: boolean;
}

const OPS = ['>>', '>', '<', '|', '&', ';'];

export function tokenize(line: string): Tokenized {
  const tokens: Token[] = [];
  let i = 0;
  const n = line.length;
  let unterminated: Tokenized['unterminated'];

  while (i < n) {
    const c = line[i] ?? '';
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '#') break;
    const op = OPS.find(o => line.startsWith(o, i));
    if (op) {
      tokens.push({ value: op, start: i, end: i + op.length, op: true });
      i += op.length;
      continue;
    }
    const start = i;
    let value = '';
    let quoted = false;
    while (i < n) {
      const ch = line[i] ?? '';
      if (/\s/.test(ch) || OPS.some(o => line.startsWith(o, i))) break;
      if (ch === "'") {
        quoted = true;
        const close = line.indexOf("'", i + 1);
        if (close === -1) {
          value += line.slice(i + 1);
          i = n;
          unterminated = "'";
          break;
        }
        value += line.slice(i + 1, close);
        i = close + 1;
        continue;
      }
      if (ch === '"') {
        quoted = true;
        i++;
        let closed = false;
        while (i < n) {
          const d = line[i] ?? '';
          if (d === '"') {
            closed = true;
            i++;
            break;
          }
          if (d === '\\' && i + 1 < n && '"\\$`'.includes(line[i + 1] ?? '')) {
            value += line[i + 1];
            i += 2;
            continue;
          }
          value += d;
          i++;
        }
        if (!closed) unterminated = '"';
        continue;
      }
      if (ch === '\\' && i + 1 < n) {
        value += line[i + 1];
        i += 2;
        continue;
      }
      value += ch;
      i++;
    }
    tokens.push({ value, start, end: i, quoted });
  }
  const last = line[n - 1];
  return { tokens, unterminated, trailingSpace: n === 0 || (last !== undefined && /\s/.test(last) && !unterminated) };
}

export interface ParsedCommand {
  args: string[];
  stdout?: { path: string; append: boolean };
  stdin?: string;
}

export type ParseResult = { ok: true; command: ParsedCommand } | { ok: false; error: string };

export function parseLine(line: string): ParseResult {
  const { tokens, unterminated } = tokenize(line);
  if (unterminated) return { ok: false, error: `unterminated ${unterminated === '"' ? 'double' : 'single'} quote` };
  const command: ParsedCommand = { args: [] };
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i] as Token;
    if (!t.op) {
      command.args.push(t.value);
      continue;
    }
    if (t.value === '|' || t.value === '&' || t.value === ';') {
      return { ok: false, error: `"${t.value}" is not supported here: one command per line` };
    }
    const target = tokens[i + 1];
    if (!target || target.op) return { ok: false, error: `syntax error near "${t.value}": a file name must follow` };
    i++;
    if (t.value === '<') command.stdin = target.value;
    else command.stdout = { path: target.value, append: t.value === '>>' };
  }
  return { ok: true, command };
}

/** Quotes an argument for display so that pasting it back gives the same word. */
export function quoteArg(arg: string): string {
  if (arg === '') return "''";
  if (/^[\w@%+=:,./-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export const formatCommand = (args: readonly string[]) => args.map(quoteArg).join(' ');
