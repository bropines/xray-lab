/**
 * Tab completion: what the word under the cursor could become.
 *
 * Pure: given the text before the cursor and what exists (files, versions),
 * it returns where the current word starts and the candidates. The line
 * editor decides what to do with them (insert one, extend to the common
 * prefix, or list them).
 */
import { BUILTINS, XRAY_COMMANDS, findCommand, type CommandSpec } from './commands';
import { quoteArg, tokenize } from './parser';

export interface CompletionContext {
  /** File paths as the user would type them: relative to cwd for /work files, absolute elsewhere. */
  files: string[];
  /** Directories, same spelling, without a trailing slash. */
  dirs?: string[];
  /** Core version tags (`v26.10.21`). */
  tags: string[];
}

export interface Completion {
  /** Offset in the line where the word being completed starts. */
  start: number;
  /** The word as typed so far (unquoted). */
  word: string;
  candidates: string[];
}

const byPrefix = (word: string, options: Iterable<string>) => [...new Set(options)].filter(o => o.startsWith(word)).sort();

/** `xray` and `xray@<version>` spellings, without the leading `v` people rarely type. */
export const xrayWords = (tags: readonly string[]) => ['xray', ...tags.map(t => `xray@${t.replace(/^v/, '')}`)];

function fileCandidates(word: string, ctx: CompletionContext): string[] {
  const dirs = (ctx.dirs ?? []).map(d => `${d}/`);
  return byPrefix(word, [...ctx.files, ...dirs]);
}

export function complete(before: string, ctx: CompletionContext): Completion {
  const { tokens, trailingSpace } = tokenize(before);
  const words = tokens.filter(t => !t.op);
  const current = trailingSpace ? undefined : tokens[tokens.length - 1];
  const start = current ? current.start : before.length;
  const word = current && !current.op ? current.value : '';
  const done = (current ? words.slice(0, -1) : words).map(t => t.value);
  const result = (candidates: string[]): Completion => ({ start, word, candidates: candidates.map(c => (c.endsWith('/') ? c : quoteArg(c))) });

  // After a redirection operator: a file name.
  const prevToken = current ? tokens[tokens.length - 2] : tokens[tokens.length - 1];
  if (prevToken?.op && (prevToken.value === '>' || prevToken.value === '>>' || prevToken.value === '<')) {
    return result(fileCandidates(word, ctx));
  }

  if (done.length === 0) {
    return result(byPrefix(word, [...BUILTINS.map(b => b.name), ...xrayWords(ctx.tags)]));
  }

  const [cmd = '', ...args] = done;
  if (cmd === 'xray' || cmd.startsWith('xray@')) return result(completeXray(args, word, ctx));

  const builtin = BUILTINS.find(b => b.name === cmd);
  if (builtin?.version) return result(byPrefix(word.replace(/^v(?=\d)/, ''), ['latest', ...ctx.tags.map(t => t.replace(/^v/, ''))]));
  if (builtin?.files) return result(fileCandidates(word, ctx));
  return result([]);
}

function completeXray(args: string[], word: string, ctx: CompletionContext): string[] {
  // Walk down the command tree as far as the typed words go.
  const path: string[] = [];
  let list: CommandSpec[] | undefined = XRAY_COMMANDS;
  for (const a of args) {
    const next: CommandSpec | undefined = list?.find(c => c.name === a);
    if (!next) break;
    path.push(a);
    list = next.sub;
  }
  const spec = path.length ? findCommand(path) : undefined;
  const positional = args.slice(path.length);

  if (spec?.name === 'help' && path.length === 1) return byPrefix(word, XRAY_COMMANDS.map(c => c.name));
  if (!spec) return positional.length === 0 ? byPrefix(word, XRAY_COMMANDS.map(c => c.name)) : [];
  if (spec.sub && positional.length === 0 && !word.startsWith('-')) return byPrefix(word, spec.sub.map(c => c.name));

  const last = positional[positional.length - 1];
  const fileFlag = /^--?(c|config|confdir|file|cert|outpbfile)$/.test(last ?? '');
  if (fileFlag) return fileCandidates(word, ctx);
  if (word.startsWith('-')) return byPrefix(word, spec.flags ?? []);
  if (spec.files) return fileCandidates(word, ctx);
  return byPrefix(word, spec.flags ?? []);
}

export function commonPrefix(items: readonly string[]): string {
  if (!items.length) return '';
  let prefix = items[0] ?? '';
  for (const s of items) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}
