/**
 * CodeMirror 6 for a config or any text file.
 *
 * JSON mode lints with the same reading the checker uses (comments and
 * trailing commas are fine, they are stripped before the core sees the
 * config), so an underline here means the core would refuse to parse it.
 * Follows the site theme: one-dark in dark mode, the default style in light.
 */
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json } from '@codemirror/lang-json';
import { bracketMatching, defaultHighlightStyle, foldGutter, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as placeholderExt,
} from '@codemirror/view';
import { useEffect, useRef } from 'react';
import { useTheme } from '../app/theme';
import { jsonProblem, stripJsonc } from '../lib/jsonc';

interface Props {
  value: string;
  onChange: (value: string) => void;
  language?: 'json' | 'text';
  placeholder?: string;
  ariaLabel: string;
  className?: string;
}

const jsonLinter = linter(view => {
  const text = view.state.doc.toString();
  if (!text.trim()) return [];
  const problem = jsonProblem(stripJsonc(text).json);
  if (!problem) return [];
  let from = 0;
  if (problem.line && problem.line <= view.state.doc.lines) {
    const line = view.state.doc.line(problem.line);
    from = Math.min(line.to, line.from + Math.max(0, (problem.column ?? 1) - 1));
  }
  const to = Math.min(view.state.doc.length, from + 1);
  const d: Diagnostic = { from, to: Math.max(from, to), severity: 'error', message: problem.message };
  return [d];
});

const baseTheme = EditorView.theme({
  '&': { backgroundColor: 'transparent' },
  '.cm-content': { caretColor: 'var(--foreground)' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--foreground) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--foreground)' },
  '.cm-tooltip': { border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden', backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 28%, transparent) !important',
  },
  '.cm-cursor': { borderLeftColor: 'var(--foreground)' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--muted)', border: 'none', color: 'var(--muted-foreground)' },
});

/** Syntax colours only; the surface comes from the page's tokens. */
const highlightFor = (dark: boolean) => syntaxHighlighting(dark ? oneDarkHighlightStyle : defaultHighlightStyle);

export function CodeEditor({ value, onChange, language = 'json', placeholder, ariaLabel, className }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const themeSlot = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const resolved = useTheme(s => s.resolved);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const dark = document.documentElement.classList.contains('dark');
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          foldGutter(),
          drawSelection(),
          history(),
          indentOnInput(),
          bracketMatching(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
          EditorView.lineWrapping,
          baseTheme,
          themeSlot.current.of(highlightFor(dark)),
          ...(language === 'json' ? [json(), jsonLinter, lintGutter()] : []),
          ...(placeholder ? [placeholderExt(placeholder)] : []),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
          EditorView.updateListener.of(u => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // The editor is made once per language; `value` changes are pushed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => {
    view.current?.dispatch({
      effects: themeSlot.current.reconfigure(highlightFor(resolved === 'dark')),
    });
  }, [resolved]);

  // Text changed from outside (a file was opened, the terminal wrote it).
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className={className} />;
}
