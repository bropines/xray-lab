import { useEffect } from 'react';
import { engine, newestStable, useEngine, type BuildInfo } from '../engine';
import { usePrefs } from '../app/prefs';

/** The manifest, loaded on first use: builds newest first, plus loading/error. */
export function useBuilds(): { builds: BuildInfo[]; loading: boolean; error?: string; retry: () => void } {
  const builds = useEngine(s => s.builds);
  const loading = useEngine(s => s.loadingManifest);
  const error = useEngine(s => s.manifestError);
  useEffect(() => {
    engine.loadManifest().catch(() => undefined);
  }, []);
  return { builds, loading, error, retry: () => void engine.loadManifest().catch(() => undefined) };
}

/** The core the terminal and tools use: the remembered one if it still exists, else the newest stable. */
export function usePreferredTag(): [string | undefined, (tag: string) => void] {
  const { builds } = useBuilds();
  const tag = usePrefs(s => s.tag);
  const set = usePrefs(s => s.set);
  const resolved = tag && builds.some(b => b.tag === tag) ? tag : newestStable(builds)?.tag;
  return [resolved, (next: string) => set({ tag: next })];
}
