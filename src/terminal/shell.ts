/**
 * The shell behind the terminal: builtins, the `xray` command, redirection.
 *
 * Independent of xterm and of React — it writes ANSI text through `io.write`
 * and asks the page (`host`) for what only a page can do: pick a file, save
 * one, open the editor panel. Tests drive it with a fake engine and a string
 * buffer.
 */
import type { Engine } from '../engine/engine';
import { isCancelled } from '../engine/engine';
import type { BuildInfo, RunResult } from '../engine/contract';
import { channelOf, normalizeTag, resolveTag } from '../engine/versions';
import { ASSET_DIR, HOME, SessionFs, displayPath, looksLikeText, resolvePath, textOf } from '../fs/session-fs';
import { formatBytes, formatMs, percent } from '../lib/format';
import { BUILTINS } from './commands';
import { complete, type Completion } from './completion';
import { parseLine, type ParsedCommand } from './parser';

export const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export interface ShellIO {
  write(text: string): void;
  clear(): void;
}

export interface ShellHost {
  upload(): Promise<{ name: string; data: Uint8Array }[]>;
  download(name: string, data: Uint8Array): void;
  edit(path: string): void;
  /** The version `xray` runs changed (the page shows it in its picker). */
  onTagChange?(tag: string): void;
}

type EngineLike = Pick<Engine, 'run' | 'loadManifest' | 'store' | 'cancel'>;

export interface ShellOptions {
  engine: EngineLike;
  fs: SessionFs;
  io: ShellIO;
  host: ShellHost;
  tag?: string;
  timeoutMs?: number;
}

const GEO_NAMES = /^(geoip|geosite)(-[\w-]+)?\.dat$/i;

/** Text for xterm: every newline is CRLF. */
export const crlf = (s: string) => s.replace(/\r?\n/g, '\r\n');

export class Shell {
  readonly history: string[] = [];
  cwd = HOME;
  tag: string | undefined;
  lastExit = 0;
  /** Bumped by `interrupt()`; a command whose generation is stale prints nothing more. */
  private generation = 0;

  constructor(private readonly opts: ShellOptions) {
    this.tag = opts.tag;
  }

  private get io() {
    return this.opts.io;
  }

  private out(text: string) {
    this.io.write(crlf(text));
  }

  private err(text: string) {
    this.io.write(crlf(`${C.red}${text}${C.reset}${text.endsWith('\n') ? '' : '\n'}`));
  }

  prompt(): string {
    const v = this.tag ? `${C.dim}xray ${this.tag.replace(/^v/, '')}${C.reset} ` : '';
    const dir = this.cwd === HOME ? '~' : this.cwd.startsWith(`${HOME}/`) ? `~/${this.cwd.slice(HOME.length + 1)}` : this.cwd;
    const arrow = this.lastExit === 0 ? `${C.green}❯${C.reset}` : `${C.red}❯${C.reset}`;
    return `${v}${C.cyan}${dir}${C.reset} ${arrow} `;
  }

  /** What Tab offers for the text before the cursor. */
  completions(before: string): Completion {
    const { fs } = this.opts;
    const rel = (p: string) => {
      if (p.startsWith(`${this.cwd}/`)) return p.slice(this.cwd.length + 1);
      return p;
    };
    const files = fs.paths().map(rel);
    const dirs = new Set<string>();
    for (const p of fs.paths()) {
      const parts = p.split('/').slice(1, -1);
      for (let i = 1; i <= parts.length; i++) dirs.add(rel(`/${parts.slice(0, i).join('/')}`));
    }
    dirs.delete(this.cwd);
    const tags = this.opts.engine.store.getState().builds.map(b => b.tag);
    return complete(before, { files, dirs: [...dirs].filter(Boolean), tags });
  }

  /** Ctrl+C while a command runs: stop downloads, give the prompt back. */
  interrupt(): void {
    this.generation++;
    this.opts.engine.cancel();
  }

  async execute(line: string): Promise<number> {
    const trimmed = line.trim();
    if (!trimmed) return this.lastExit;
    if (this.history[this.history.length - 1] !== trimmed) this.history.push(trimmed);
    const parsed = parseLine(trimmed);
    if (!parsed.ok) {
      this.err(`sh: ${parsed.error}`);
      return (this.lastExit = 2);
    }
    const gen = this.generation;
    try {
      const code = await this.dispatch(parsed.command, gen);
      return (this.lastExit = code);
    } catch (e) {
      if (isCancelled(e)) {
        return (this.lastExit = 130);
      }
      this.err(`sh: ${e instanceof Error ? e.message : String(e)}`);
      return (this.lastExit = 1);
    }
  }

  private async dispatch(cmd: ParsedCommand, gen: number): Promise<number> {
    const [name = '', ...args] = cmd.args;
    if (name === 'xray' || name.startsWith('xray@')) return this.xray(name, args, cmd, gen);

    // Builtins write to the terminal, or to a file with `>`.
    let captured = '';
    const write = cmd.stdout ? (s: string) => { captured += s; } : (s: string) => this.out(s);
    const code = await this.builtin(name, args, write);
    if (cmd.stdout) this.redirect(cmd.stdout, captured);
    return code;
  }

  private redirect(target: { path: string; append: boolean }, text: string) {
    const { fs } = this.opts;
    const path = resolvePath(target.path, this.cwd);
    const prev = target.append ? (fs.readText(path) ?? '') : '';
    fs.write(path, prev + text);
  }

  private async builtin(name: string, args: string[], write: (s: string) => void): Promise<number> {
    const { fs, host } = this.opts;
    const path = (p: string) => resolvePath(p, this.cwd);
    switch (name) {
      case 'help':
        write(this.helpText());
        return 0;
      case 'clear':
        this.io.clear();
        return 0;
      case 'pwd':
        write(`${this.cwd}\n`);
        return 0;
      case 'echo':
        write(`${args.join(' ')}\n`);
        return 0;
      case 'history':
        write(this.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n') + '\n');
        return 0;
      case 'cd': {
        const target = path(args[0] ?? HOME);
        if (!fs.isDir(target)) {
          this.err(`cd: ${args[0]}: no such directory`);
          return 1;
        }
        this.cwd = target;
        return 0;
      }
      case 'ls': {
        const targets = args.filter(a => !a.startsWith('-'));
        const dir = path(targets[0] ?? '.');
        if (fs.exists(dir)) {
          const size = fs.read(dir)?.length ?? 0;
          write(`${formatBytes(size).padStart(9)}  ${displayPath(dir)}\n`);
          return 0;
        }
        if (!fs.isDir(dir)) {
          this.err(`ls: ${targets[0]}: no such file or directory`);
          return 1;
        }
        const entries = fs.list(dir);
        if (!entries.length) {
          write(`${C.dim}(empty — try "upload", or paste a config on the Check page)${C.reset}\n`);
          return 0;
        }
        for (const e of entries) {
          write(e.dir
            ? `${''.padStart(9)}  ${C.blue}${C.bold}${e.name}/${C.reset}\n`
            : `${formatBytes(e.size).padStart(9)}  ${e.name}\n`);
        }
        return 0;
      }
      case 'cat': {
        if (!args.length) {
          this.err('usage: cat <file>…');
          return 2;
        }
        let code = 0;
        for (const a of args) {
          const data = fs.read(path(a));
          if (!data) {
            this.err(`cat: ${a}: no such file`);
            code = 1;
            continue;
          }
          if (!looksLikeText(data)) {
            this.err(`cat: ${a}: binary file (${formatBytes(data.length)}); use "download ${a}"`);
            code = 1;
            continue;
          }
          const text = textOf(data);
          write(text.endsWith('\n') || !text ? text : `${text}\n`);
        }
        return code;
      }
      case 'rm': {
        const force = args.includes('-f') || args.includes('-rf');
        const targets = args.filter(a => !a.startsWith('-'));
        if (!targets.length) {
          this.err('usage: rm <file>…');
          return 2;
        }
        let code = 0;
        for (const a of targets) {
          if (!fs.remove(path(a)) && !force) {
            this.err(`rm: ${a}: no such file`);
            code = 1;
          }
        }
        return code;
      }
      case 'cp':
      case 'mv': {
        const [from, to] = args;
        if (!from || !to) {
          this.err(`usage: ${name} <from> <to>`);
          return 2;
        }
        const data = fs.read(path(from));
        if (!data) {
          this.err(`${name}: ${from}: no such file`);
          return 1;
        }
        let dest = path(to);
        if (fs.isDir(dest) && !fs.exists(dest)) dest = `${dest}/${path(from).split('/').pop()}`;
        fs.write(dest, data);
        if (name === 'mv' && dest !== path(from)) fs.remove(path(from));
        return 0;
      }
      case 'edit': {
        if (!args[0]) {
          this.err('usage: edit <file>');
          return 2;
        }
        const p = path(args[0]);
        const data = fs.read(p);
        if (data && !looksLikeText(data)) {
          this.err(`edit: ${args[0]}: binary file`);
          return 1;
        }
        if (!data) fs.write(p, '');
        host.edit(p);
        write(`${C.dim}Opened ${displayPath(p)} in the editor panel.${C.reset}\n`);
        return 0;
      }
      case 'download': {
        if (!args.length) {
          this.err('usage: download <file>…');
          return 2;
        }
        for (const a of args) {
          const data = fs.read(path(a));
          if (!data) {
            this.err(`download: ${a}: no such file`);
            return 1;
          }
          host.download(a, data);
        }
        return 0;
      }
      case 'upload': {
        const picked = await host.upload();
        if (!picked.length) {
          write(`${C.dim}Nothing picked.${C.reset}\n`);
          return 0;
        }
        for (const f of picked) {
          const dest = GEO_NAMES.test(f.name) ? `${ASSET_DIR}/${f.name}` : path(f.name);
          fs.write(dest, f.data);
          write(`${C.green}+${C.reset} ${displayPath(dest)} ${C.dim}(${formatBytes(f.data.length)})${C.reset}\n`);
        }
        return 0;
      }
      case 'use': {
        const builds = await this.builds();
        if (!builds) return 1;
        if (!args[0]) {
          write(`xray → ${this.tag ?? '(none)'}\n`);
          return 0;
        }
        const tag = resolveTag(args[0], builds);
        if (!tag) {
          this.err(`use: no core ${normalizeTag(args[0])} here; "versions" lists them`);
          return 1;
        }
        this.tag = tag;
        this.opts.host.onTagChange?.(tag);
        write(`xray → ${tag}\n`);
        return 0;
      }
      case 'versions': {
        const builds = await this.builds();
        if (!builds) return 1;
        const states = this.opts.engine.store.getState().tags;
        for (const b of builds) {
          const phase = states[b.tag]?.phase;
          const where = phase === 'ready' ? `${C.green}loaded${C.reset}` : phase === 'cached' ? `${C.green}cached${C.reset}` : `${C.dim}${formatBytes(b.gzip || b.size)}${C.reset}`;
          const mark = b.tag === this.tag ? `${C.cyan}*${C.reset}` : ' ';
          const ch = channelOf(b);
          const label = ch === 'stable' ? '' : ch === 'withdrawn' ? `${C.yellow}withdrawn${C.reset}` : `${C.dim}pre-release${C.reset}`;
          write(`${mark} ${b.tag.padEnd(11)} ${where.padEnd(18)} ${label}\n`);
        }
        return 0;
      }
      default:
        this.err(`${name}: command not found. Type "help" for the list.`);
        return 127;
    }
  }

  private async builds(): Promise<BuildInfo[] | null> {
    try {
      await this.opts.engine.loadManifest();
      return this.opts.engine.store.getState().builds;
    } catch (e) {
      this.err(`Could not load the list of cores: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }

  private async xray(name: string, args: string[], cmd: ParsedCommand, gen: number): Promise<number> {
    const { fs, engine } = this.opts;
    const builds = await this.builds();
    if (!builds) return 1;
    const wanted = name.startsWith('xray@') ? name.slice(5) : undefined;
    const tag = wanted ? resolveTag(wanted, builds) : this.tag;
    if (!tag) {
      this.err(wanted ? `xray@${wanted}: no such core here; "versions" lists them` : 'No core chosen; "use latest" picks the newest stable.');
      return 127;
    }

    let stdin: string | undefined;
    if (cmd.stdin) {
      const data = fs.read(resolvePath(cmd.stdin, this.cwd));
      if (!data) {
        this.err(`sh: ${cmd.stdin}: no such file`);
        return 1;
      }
      stdin = textOf(data);
    }

    const stopProgress = this.showProgress(tag, gen);
    const before = fs.snapshot();
    let result: RunResult;
    try {
      result = await engine.run(args, { tag, files: before, cwd: this.cwd, stdin, timeoutMs: this.opts.timeoutMs ?? 60_000 });
    } finally {
      stopProgress();
    }
    if (gen !== this.generation) return 130;

    if (cmd.stdout) this.redirect(cmd.stdout, result.stdout);
    else if (result.stdout) this.out(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
    if (result.stderr) this.io.write(crlf(result.exitCode === 0 ? result.stderr : `${C.red}${result.stderr}${C.reset}`) + (result.stderr.endsWith('\n') ? '' : '\r\n'));
    if (result.timedOut) this.err(`Timed out after ${formatMs(this.opts.timeoutMs ?? 60_000)}.`);

    const changed: string[] = [];
    for (const [p, data] of Object.entries(result.files ?? {})) {
      const abs = resolvePath(p, this.cwd);
      const prev = before[abs];
      if (prev && prev.length === data.length && prev.every((x, i) => x === data[i])) continue;
      fs.write(abs, data);
      changed.push(displayPath(abs));
    }
    if (changed.length) this.out(`${C.dim}wrote ${changed.join(', ')}${C.reset}\n`);
    return result.exitCode;
  }

  /** A one-line progress bar while a core downloads; returns the function that removes it. */
  private showProgress(tag: string, gen: number): () => void {
    const { engine } = this.opts;
    const phase = engine.store.getState().tags[tag]?.phase;
    if (phase === 'ready') return () => {};
    let drawn = false;
    const draw = () => {
      if (gen !== this.generation) return;
      const s = engine.store.getState().tags[tag];
      if (!s || s.phase !== 'downloading') return;
      const pct = percent(s.loaded, s.total);
      const width = 20;
      const fill = Math.round((pct / 100) * width);
      const verb = phase === 'cached' ? 'Loading' : 'Downloading';
      this.io.write(`\r\x1b[K${C.dim}${verb} Xray ${tag} ${C.reset}[${'#'.repeat(fill)}${' '.repeat(width - fill)}] ${pct}% ${C.dim}${formatBytes(s.loaded)} / ${formatBytes(s.total)}${C.reset}`);
      drawn = true;
    };
    draw();
    const unsubscribe = engine.store.subscribe(draw);
    return () => {
      unsubscribe();
      if (drawn) this.io.write('\r\x1b[K');
    };
  }

  helpText(): string {
    const lines = BUILTINS.map(b => `  ${C.cyan}${b.usage.padEnd(18)}${C.reset} ${b.summary}`);
    return [
      `${C.bold}A shell with the real xray installed.${C.reset} Files live in this tab (${HOME}); geo data in ${ASSET_DIR}.`,
      '',
      ...lines,
      '',
      `${C.dim}Try:${C.reset}  xray version   xray x25519   xray uuid -i "my name"   xray run -test -c config.json`,
      `${C.dim}Keys:${C.reset} Tab completes, ↑/↓ history, Ctrl+C cancels a download, Ctrl+L clears. ${C.dim}Redirect with > file.${C.reset}`,
      '',
    ].join('\n');
  }
}
