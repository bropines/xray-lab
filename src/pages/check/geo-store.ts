/**
 * Fetching geo files, shared by the geo card and the Inconclusive rows, so
 * either can start a download and both show it.
 */
import { create } from 'zustand';
import { sessionFs } from '../../fs';
import { GEO_FILES, fetchGeo, geoPath, type GeoName } from '../../lib/geo';

interface Progress {
  loaded: number;
  total: number;
}

interface GeoState {
  fetching: Partial<Record<GeoName, Progress>>;
  errors: Partial<Record<string, string>>;
  fetch: (name: GeoName) => Promise<void>;
  cancel: (name: GeoName) => void;
  setError: (name: string, error: string | undefined) => void;
}

const controllers = new Map<GeoName, AbortController>();

export const isGeoName = (name: string): name is GeoName => GEO_FILES.some(g => g.name === name);

export const useGeo = create<GeoState>((set, get) => ({
  fetching: {},
  errors: {},
  async fetch(name) {
    if (get().fetching[name]) return;
    const ctrl = new AbortController();
    controllers.set(name, ctrl);
    const approx = GEO_FILES.find(g => g.name === name)?.approxBytes ?? 0;
    set(s => ({ fetching: { ...s.fetching, [name]: { loaded: 0, total: approx } }, errors: { ...s.errors, [name]: undefined } }));
    try {
      const data = await fetchGeo(name, (loaded, total) => set(s => ({ fetching: { ...s.fetching, [name]: { loaded, total } } })), ctrl.signal);
      sessionFs.write(geoPath(name), data);
    } catch (e) {
      if (!ctrl.signal.aborted) set(s => ({ errors: { ...s.errors, [name]: e instanceof Error ? e.message : String(e) } }));
    } finally {
      controllers.delete(name);
      set(s => ({ fetching: { ...s.fetching, [name]: undefined } }));
    }
  },
  cancel(name) {
    controllers.get(name)?.abort();
  },
  setError(name, error) {
    set(s => ({ errors: { ...s.errors, [name]: error } }));
  },
}));
