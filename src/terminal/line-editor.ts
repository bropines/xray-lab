/**
 * A readline for xterm.js: one input line, cursor movement, history, Tab.
 *
 * Independent of xterm: it receives what `terminal.onData` delivers (keys as
 * bytes and escape sequences, pastes as strings) and writes ANSI back through
 * `write`. It redraws the whole line on every change, accounting for lines
 * that wrap at `cols()` — which is what keeps it correct on a phone, where
 * almost every command wraps.
 */
import { commonPrefix, type Completion } from './completion';

export type EditorEvent = { type: 'submit'; line: string } | { type: 'interrupt' } | { type: 'clear' };

export interface LineEditorOptions {
  write: (data: string) => void;
  prompt: () => string;
  cols: () => number;
  complete: (before: string) => Completion;
  history: () => readonly string[];
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
export const visibleLength = (s: string) => s.replace(ANSI, '').length;

const KEYS: Record<string, string> = {
  '\x1b[A': 'up',
  '\x1bOA': 'up',
  '\x1b[B': 'down',
  '\x1bOB': 'down',
  '\x1b[C': 'right',
  '\x1bOC': 'right',
  '\x1b[D': 'left',
  '\x1bOD': 'left',
  '\x1b[H': 'home',
  '\x1bOH': 'home',
  '\x1b[1~': 'home',
  '\x1b[F': 'end',
  '\x1bOF': 'end',
  '\x1b[4~': 'end',
  '\x1b[3~': 'delete',
  '\x1b[1;5C': 'wordRight',
  '\x1b[1;5D': 'wordLeft',
  '\x1bf': 'wordRight',
  '\x1bb': 'wordLeft',
};

export class LineEditor {
  buffer = '';
  cursor = 0;
  private historyIndex = -1;
  private draft = '';
  /** Row of the cursor inside the drawn input, counted from the prompt's row. */
  private cursorRow = 0;

  constructor(private readonly opts: LineEditorOptions) {}

  /** Draws a fresh prompt on the current line. */
  start(): void {
    this.buffer = '';
    this.cursor = 0;
    this.historyIndex = -1;
    this.draft = '';
    this.cursorRow = 0;
    this.render();
  }

  /** Redraws after something else wrote (a resize, a listing). */
  redrawFresh(): void {
    this.cursorRow = 0;
    this.render();
  }

  /** Redraws in place (the prompt changed). */
  refresh(): void {
    this.render();
  }

  setLine(text: string): void {
    this.buffer = text;
    this.cursor = text.length;
    this.render();
  }

  feed(data: string): EditorEvent[] {
    const events: EditorEvent[] = [];
    let i = 0;
    while (i < data.length) {
      const seq = Object.keys(KEYS).find(k => data.startsWith(k, i));
      if (seq) {
        this.key(KEYS[seq] as string);
        i += seq.length;
        continue;
      }
      const c = data[i] as string;
      i++;
      switch (c) {
        case '\r':
        case '\n': {
          if (c === '\n' && data[i - 2] === '\r') break;
          const line = this.buffer;
          this.moveToEnd();
          this.opts.write('\r\n');
          this.cursorRow = 0;
          events.push({ type: 'submit', line });
          this.buffer = '';
          this.cursor = 0;
          this.historyIndex = -1;
          break;
        }
        case '\x7f':
        case '\b':
          if (this.cursor > 0) {
            this.buffer = this.buffer.slice(0, this.cursor - 1) + this.buffer.slice(this.cursor);
            this.cursor--;
            this.render();
          }
          break;
        case '\t':
          this.tab();
          break;
        case '\x03':
          this.moveToEnd();
          this.opts.write('^C\r\n');
          this.cursorRow = 0;
          this.buffer = '';
          this.cursor = 0;
          events.push({ type: 'interrupt' });
          break;
        case '\x0c':
          events.push({ type: 'clear' });
          break;
        case '\x01':
          this.key('home');
          break;
        case '\x05':
          this.key('end');
          break;
        case '\x02':
          this.key('left');
          break;
        case '\x06':
          this.key('right');
          break;
        case '\x10':
          this.key('up');
          break;
        case '\x0e':
          this.key('down');
          break;
        case '\x15':
          this.buffer = this.buffer.slice(this.cursor);
          this.cursor = 0;
          this.render();
          break;
        case '\x0b':
          this.buffer = this.buffer.slice(0, this.cursor);
          this.render();
          break;
        case '\x17': {
          const before = this.buffer.slice(0, this.cursor).replace(/\S*\s*$/, '');
          this.buffer = before + this.buffer.slice(this.cursor);
          this.cursor = before.length;
          this.render();
          break;
        }
        case '\x1b':
          // A lone Escape or a sequence nobody maps: skip the rest of it.
          while (i < data.length && /[[\]0-9;O?]/.test(data[i] as string)) i++;
          if (i < data.length && /[A-Za-z~]/.test(data[i] as string)) i++;
          break;
        default:
          if (c >= ' ') {
            // Insert the run of printable characters at once (a paste).
            let j = i;
            while (j < data.length && (data[j] as string) >= ' ' && data[j] !== '\x7f' && data[j] !== '\x1b') j++;
            const text = c + data.slice(i, j);
            i = j;
            this.buffer = this.buffer.slice(0, this.cursor) + text + this.buffer.slice(this.cursor);
            this.cursor += text.length;
            this.render();
          }
      }
    }
    return events;
  }

  private key(name: string) {
    const history = this.opts.history();
    switch (name) {
      case 'left':
        if (this.cursor > 0) this.cursor--;
        break;
      case 'right':
        if (this.cursor < this.buffer.length) this.cursor++;
        break;
      case 'home':
        this.cursor = 0;
        break;
      case 'end':
        this.cursor = this.buffer.length;
        break;
      case 'delete':
        this.buffer = this.buffer.slice(0, this.cursor) + this.buffer.slice(this.cursor + 1);
        break;
      case 'wordLeft':
        this.cursor = this.buffer.slice(0, this.cursor).replace(/\S+\s*$/, '').length;
        break;
      case 'wordRight': {
        const m = /^\s*\S+/.exec(this.buffer.slice(this.cursor));
        this.cursor += m ? m[0].length : this.buffer.length - this.cursor;
        break;
      }
      case 'up':
        if (!history.length) return;
        if (this.historyIndex === -1) {
          this.draft = this.buffer;
          this.historyIndex = history.length - 1;
        } else if (this.historyIndex > 0) this.historyIndex--;
        this.buffer = history[this.historyIndex] ?? '';
        this.cursor = this.buffer.length;
        break;
      case 'down':
        if (this.historyIndex === -1) return;
        if (this.historyIndex < history.length - 1) {
          this.historyIndex++;
          this.buffer = history[this.historyIndex] ?? '';
        } else {
          this.historyIndex = -1;
          this.buffer = this.draft;
        }
        this.cursor = this.buffer.length;
        break;
    }
    this.render();
  }

  private tab() {
    const before = this.buffer.slice(0, this.cursor);
    const { start, candidates } = this.opts.complete(before);
    const typed = before.slice(start);
    if (!candidates.length) {
      this.opts.write('\x07');
      return;
    }
    const insert = (text: string) => {
      this.buffer = this.buffer.slice(0, start) + text + this.buffer.slice(this.cursor);
      this.cursor = start + text.length;
      this.render();
    };
    if (candidates.length === 1) {
      const only = candidates[0] as string;
      insert(only.endsWith('/') ? only : `${only} `);
      return;
    }
    const common = commonPrefix(candidates);
    if (common.length > typed.length) {
      insert(common);
      return;
    }
    // Ambiguous: list them under the line, then draw the line again.
    this.moveToEnd();
    const width = Math.max(...candidates.map(c => c.length)) + 2;
    const perRow = Math.max(1, Math.floor(this.opts.cols() / width));
    let out = '\r\n';
    candidates.forEach((c, k) => {
      out += c.padEnd(width);
      if ((k + 1) % perRow === 0 && k < candidates.length - 1) out += '\r\n';
    });
    this.opts.write(`${out}\r\n`);
    this.cursorRow = 0;
    this.render();
  }

  /** Puts the terminal cursor after the last character of the input. */
  private moveToEnd() {
    const cols = Math.max(1, this.opts.cols());
    const p = visibleLength(this.opts.prompt());
    const endRow = Math.floor((p + this.buffer.length) / cols);
    const rowNow = this.cursorRow;
    if (endRow > rowNow) this.opts.write(`\x1b[${endRow - rowNow}B`);
    this.opts.write(`\r${(p + this.buffer.length) % cols ? `\x1b[${(p + this.buffer.length) % cols}C` : ''}`);
    this.cursorRow = endRow;
  }

  private render() {
    const cols = Math.max(1, this.opts.cols());
    const prompt = this.opts.prompt();
    const p = visibleLength(prompt);
    let out = '';
    if (this.cursorRow > 0) out += `\x1b[${this.cursorRow}A`;
    out += '\r\x1b[J' + prompt + this.buffer;
    const end = p + this.buffer.length;
    let row = Math.floor(end / cols);
    if (end > 0 && end % cols === 0) {
      // The cursor sits in the last column waiting to wrap; make it wrap.
      out += ' \r';
    }
    const target = p + this.cursor;
    const targetRow = Math.floor(target / cols);
    const targetCol = target % cols;
    if (row > targetRow) out += `\x1b[${row - targetRow}A`;
    out += '\r';
    if (targetCol) out += `\x1b[${targetCol}C`;
    row = targetRow;
    this.cursorRow = row;
    this.opts.write(out);
  }
}
