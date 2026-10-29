/**
 * A check run: one config, several versions, one at a time.
 *
 * Kept outside the page so that leaving Check for the terminal and coming
 * back keeps the results (and a run in progress keeps going). Versions are
 * checked in order, each after the previous one finished: each is a
 * separate ~12 MB download the first time, and a phone does not want two
 * Go runtimes at once. Cancelling stops the download in flight and skips
 * the rest; a check already inside the core finishes.
 */
import { create } from 'zustand';
import { engine, isCancelled, type CheckResult } from '../../engine';
import { sessionFs } from '../../fs';
import { stripJsonc } from '../../lib/jsonc';

export type RowStatus = 'queued' | 'running' | 'done' | 'cancelled';

export interface Row {
  tag: string;
  status: RowStatus;
  result?: CheckResult;
}

export interface CheckRun {
  id: number;
  /** The text as it was when the run started (to tell when the editor moved on). */
  configText: string;
  rows: Row[];
  finished: boolean;
  cancelled: boolean;
}

interface CheckState {
  run?: CheckRun;
  running: boolean;
  start: (tags: string[], configText: string) => Promise<void>;
  /** Checks one version again with the current files (after attaching what was missing). */
  recheck: (tag: string, configText: string) => Promise<void>;
  cancel: () => void;
  clear: () => void;
}

export const CHECK_TIMEOUT_MS = 60_000;

let nextId = 1;

export const useCheck = create<CheckState>((set, get) => {
  const patchRow = (id: number, tag: string, patch: Partial<Row>) =>
    set(s => (s.run?.id === id ? { run: { ...s.run, rows: s.run.rows.map(r => (r.tag === tag ? { ...r, ...patch } : r)) } } : {}));

  return {
    running: false,

    async start(tags, configText) {
      if (get().running) return;
      const id = nextId++;
      const json = stripJsonc(configText).json;
      const files = sessionFs.snapshot();
      set({
        running: true,
        run: { id, configText, rows: tags.map(tag => ({ tag, status: 'queued' })), finished: false, cancelled: false },
      });
      for (const tag of tags) {
        if (get().run?.id !== id || get().run?.cancelled) break;
        patchRow(id, tag, { status: 'running' });
        try {
          const result = await engine.check(json, tag, { files, timeoutMs: CHECK_TIMEOUT_MS });
          patchRow(id, tag, { status: 'done', result });
        } catch (e) {
          if (!isCancelled(e)) throw e;
          patchRow(id, tag, { status: 'cancelled' });
          break;
        }
      }
      set(s =>
        s.run?.id === id
          ? {
              running: false,
              run: { ...s.run, finished: true, rows: s.run.rows.map(r => (r.status === 'queued' || r.status === 'running' ? { ...r, status: 'cancelled' } : r)) },
            }
          : { running: false },
      );
    },

    async recheck(tag, configText) {
      const run = get().run;
      if (!run || get().running) return;
      const id = run.id;
      set({ running: true });
      patchRow(id, tag, { status: 'running' });
      try {
        const result = await engine.check(stripJsonc(configText).json, tag, { files: sessionFs.snapshot(), timeoutMs: CHECK_TIMEOUT_MS });
        patchRow(id, tag, { status: 'done', result });
      } catch (e) {
        if (!isCancelled(e)) throw e;
        patchRow(id, tag, { status: 'cancelled' });
      } finally {
        set({ running: false });
      }
    },

    cancel() {
      set(s => (s.run ? { run: { ...s.run, cancelled: true } } : {}));
      engine.cancel();
    },

    clear() {
      if (!get().running) set({ run: undefined });
    },
  };
});
