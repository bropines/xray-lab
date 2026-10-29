/**
 * Terminal: a shell with `xray` installed, in xterm.js.
 *
 * The shell (src/terminal/shell.ts) and the line editor are plain classes;
 * this page only wires them to xterm, the version picker, the file picker
 * and the editor panel. The app keeps this page mounted once visited (see
 * App.tsx), so the scrollback, the history and a running command survive a
 * trip to another page.
 */
import { FitAddon } from '@xterm/addon-fit';
import { Terminal, type ITheme } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { DownloadSimpleIcon, FileIcon, QuestionIcon, UploadSimpleIcon } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '../app/theme';
import { CodeEditor } from '../components/CodeEditor';
import { VersionSelect } from '../components/VersionPicker';
import { useBuilds, usePreferredTag } from '../components/useBuilds';
import { Button, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../components/ui';
import { engine } from '../engine';
import { displayPath, sessionFs, useFs } from '../fs';
import { useLang, useT } from '../i18n';
import { downloadBytes, pickFiles } from '../lib/download';
import { formatBytes } from '../lib/format';
import { LineEditor } from '../terminal/line-editor';
import { C, Shell } from '../terminal/shell';

const DARK: ITheme = {
  background: '#09090b',
  foreground: '#fafafa',
  cursor: '#fafafa',
  cursorAccent: '#09090b',
  selectionBackground: 'rgba(96, 165, 250, 0.35)',
  black: '#27272a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#e879f9',
  cyan: '#22d3ee',
  white: '#e4e4e7',
  brightBlack: '#71717a',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#f0abfc',
  brightCyan: '#67e8f9',
  brightWhite: '#ffffff',
};

const LIGHT: ITheme = {
  background: '#fafafa',
  foreground: '#09090b',
  cursor: '#09090b',
  cursorAccent: '#fafafa',
  selectionBackground: 'rgba(37, 99, 235, 0.22)',
  black: '#09090b',
  red: '#b91c1c',
  green: '#15803d',
  yellow: '#a16207',
  blue: '#1d4ed8',
  magenta: '#a21caf',
  cyan: '#0e7490',
  white: '#52525b',
  brightBlack: '#71717a',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#ca8a04',
  brightBlue: '#2563eb',
  brightMagenta: '#c026d3',
  brightCyan: '#0891b2',
  brightWhite: '#27272a',
};

const EXAMPLES = ['xray version', 'xray x25519', 'xray uuid -i "my name"', 'xray run -test -c config.json', 'versions', 'help'];

/** On-screen keys for phones; each sends what the physical key would. */
const KEY_ROW: { label: string; data: string; aria: string }[] = [
  { label: 'Tab', data: '\t', aria: 'Tab' },
  { label: '↑', data: '\x1b[A', aria: 'Up' },
  { label: '↓', data: '\x1b[B', aria: 'Down' },
  { label: '←', data: '\x1b[D', aria: 'Left' },
  { label: '→', data: '\x1b[C', aria: 'Right' },
  { label: '^C', data: '\x03', aria: 'Ctrl+C' },
  { label: '^L', data: '\x0c', aria: 'Ctrl+L' },
  { label: '-', data: '-', aria: 'Dash' },
  { label: '"', data: '"', aria: 'Quote' },
  { label: '⏎', data: '\r', aria: 'Enter' },
];

export default function TerminalPage() {
  const t = useT();
  const lang = useLang(s => s.lang);
  const { builds } = useBuilds();
  const [tag, setTag] = usePreferredTag();
  const resolved = useTheme(s => s.resolved);
  const host = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const shellRef = useRef<Shell | null>(null);
  const editorRef = useRef<LineEditor | null>(null);
  const feedRef = useRef<(data: string) => void>(() => {});
  /** A command is running: keys other than Ctrl+C wait, the prompt is not redrawn. */
  const busyRef = useRef(false);
  const [editing, setEditing] = useState<string | null>(null);
  const setTagRef = useRef(setTag);
  useEffect(() => {
    setTagRef.current = setTag;
  });

  // One terminal for the life of the page.
  useEffect(() => {
    if (!host.current) return;
    const dark = document.documentElement.classList.contains('dark');
    const phone = window.matchMedia('(max-width: 640px)').matches;
    const term = new Terminal({
      fontFamily: '"Geist Mono Variable", ui-monospace, "Cascadia Mono", Consolas, monospace',
      fontSize: phone ? 12.5 : 13.5,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: dark ? DARK : LIGHT,
      allowTransparency: false,
      macOptionIsMeta: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    termRef.current = term;

    const shell = new Shell({
      engine,
      fs: sessionFs,
      tag: undefined,
      io: {
        write: s => term.write(s),
        clear: () => term.write('\x1b[2J\x1b[3J\x1b[H'),
      },
      host: {
        upload: async () => {
          const files = await pickFiles({ multiple: true });
          return Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
        },
        download: (name, data) => downloadBytes(name, data),
        edit: path => setEditing(path),
        onTagChange: next => setTagRef.current(next),
      },
    });
    shellRef.current = shell;

    const editor = new LineEditor({
      write: s => term.write(s),
      prompt: () => shell.prompt(),
      cols: () => term.cols,
      complete: before => shell.completions(before),
      history: () => shell.history,
    });
    editorRef.current = editor;

    let runId = 0;
    const execute = async (lines: string[]) => {
      for (const line of lines) {
        const id = ++runId;
        busyRef.current = true;
        await shell.execute(line);
        if (id !== runId) return; // interrupted: the prompt is already back
        busyRef.current = false;
      }
      editor.start();
    };
    const feed = (data: string) => {
      if (busyRef.current) {
        if (data.includes('\x03')) {
          runId++;
          busyRef.current = false;
          shell.interrupt();
          shell.lastExit = 130;
          term.write('^C\r\n');
          editor.start();
        }
        return;
      }
      const lines: string[] = [];
      for (const ev of editor.feed(data)) {
        if (ev.type === 'submit') lines.push(ev.line);
        else if (ev.type === 'interrupt') {
          shell.lastExit = 130;
          editor.start();
        } else if (ev.type === 'clear') {
          term.write('\x1b[2J\x1b[3J\x1b[H');
          editor.redrawFresh();
        }
      }
      if (lines.length) void execute(lines);
    };
    feedRef.current = feed;
    const sub = term.onData(feed);

    let disposed = false;
    const fontReady = document.fonts?.load('13px "Geist Mono Variable"').catch(() => undefined) ?? Promise.resolve();
    void fontReady.then(() => {
      if (disposed || !host.current) return;
      term.open(host.current);
      fit.fit();
      term.write(crlfBanner(t('terminal.banner1'), t('terminal.banner2')));
      editor.start();
      if (!phone) term.focus();
    });

    const ro = new ResizeObserver(() => {
      if (!term.element) return;
      try {
        fit.fit();
      } catch {
        // Hidden (display: none) while another page is shown.
      }
    });
    ro.observe(host.current);

    return () => {
      disposed = true;
      ro.disconnect();
      sub.dispose();
      term.dispose();
      termRef.current = null;
    };
    // Made once; the theme and the version are pushed in below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = resolved === 'dark' ? DARK : LIGHT;
  }, [resolved]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || !tag || shell.tag === tag) return;
    shell.tag = tag;
    // Before the terminal is open the prompt has not been drawn yet.
    if (termRef.current?.element && !busyRef.current) editorRef.current?.refresh();
  }, [tag]);

  const send = useCallback((data: string) => {
    feedRef.current(data);
  }, []);

  const typeCommand = (cmd: string) => {
    editorRef.current?.setLine(cmd);
    termRef.current?.focus();
  };

  const upload = async () => {
    typeCommand('upload');
    send('\r');
  };

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-4rem)] w-full max-w-7xl flex-col px-4 py-4 sm:h-[calc(100dvh-3.5rem)] sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-lg font-semibold tracking-tight">{t('terminal.title')}</h1>
        <VersionSelect builds={builds} value={tag} onChange={setTag} />
        <Button size="sm" variant="outline" onClick={upload} aria-label={t('terminal.upload')}>
          <UploadSimpleIcon />
          <span className="max-sm:sr-only">{t('terminal.upload')}</span>
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { typeCommand('help'); send('\r'); }} aria-label={t('terminal.help')}>
          <QuestionIcon />
        </Button>
      </div>

      <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" aria-label={t('terminal.examples')}>
        {EXAMPLES.map(cmd => (
          <button
            key={cmd}
            type="button"
            className="shrink-0 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            onClick={() => typeCommand(cmd)}
          >
            {cmd}
          </button>
        ))}
      </div>

      <div className="xterm-host min-h-0 flex-1 overflow-hidden rounded-lg border" style={{ background: resolved === 'dark' ? DARK.background : LIGHT.background }}>
        <div ref={host} className="h-full w-full" />
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto sm:hidden" role="toolbar" aria-label={t('terminal.keys')}>
        {KEY_ROW.map(k => (
          <Button
            key={k.label}
            size="sm"
            variant="outline"
            className="h-9 min-w-10 shrink-0 px-2 font-mono"
            aria-label={k.aria}
            // Keep the focus (and the phone keyboard) in the terminal.
            onPointerDown={e => e.preventDefault()}
            onClick={() => send(k.data)}
          >
            {k.label}
          </Button>
        ))}
      </div>

      <Sheet open={!!editing} onOpenChange={open => !open && setEditing(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
          {editing && <FileEditor path={editing} lang={lang} tag={tag} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FileEditor({ path, lang, tag }: { path: string; lang: string; tag?: string }) {
  const t = useT();
  const data = useFs(s => s.files[path]?.data);
  const text = data ? new TextDecoder().decode(data) : '';
  const isJson = /\.jsonc?$/i.test(path);
  return (
    <>
      <SheetHeader className="border-b pr-12">
        <SheetTitle className="flex items-center gap-2 font-mono text-sm">
          <FileIcon className="size-4" />
          {displayPath(path)}
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{t('terminal.editorHint')}</span>
          <span className="tabular-nums">{formatBytes(data?.length ?? 0, lang)}</span>
        </SheetDescription>
      </SheetHeader>
      <div className="min-h-0 flex-1">
        <CodeEditor
          value={text}
          onChange={v => sessionFs.write(path, v)}
          language={isJson ? 'json' : 'text'}
          ariaLabel={displayPath(path)}
          schemaTag={tag}
          className="h-full"
        />
      </div>
      <div className="flex justify-end gap-2 border-t p-3">
        <Button size="sm" variant="outline" onClick={() => downloadBytes(path, data ?? new Uint8Array())}>
          <DownloadSimpleIcon />
          {t('terminal.downloadFile')}
        </Button>
      </div>
    </>
  );
}

function crlfBanner(line1: string, line2: string): string {
  return `${C.bold}Xray Lab${C.reset} ${C.dim}— ${line1}${C.reset}\r\n${C.dim}${line2}${C.reset}\r\n${C.dim}Try:${C.reset} ${C.cyan}xray version${C.reset}  ${C.cyan}xray x25519${C.reset}  ${C.cyan}xray run -test -c config.json${C.reset}  ${C.cyan}help${C.reset}\r\n\r\n`;
}
