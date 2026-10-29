import { useStore } from 'zustand';
import { SessionFs, type FsState } from './session-fs';

/** The one file system of this tab. */
export const sessionFs = new SessionFs();

// Saving is debounced; a tab being closed saves now.
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => sessionFs.persistNow());

export function useFs<T>(selector: (s: FsState) => T): T {
  return useStore(sessionFs.store, selector);
}

export * from './session-fs';
