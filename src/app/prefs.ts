/**
 * Per-viewer conveniences, remembered in localStorage: the core the terminal
 * and the tools use, and the versions the Check page last ran on. Losing them
 * (private window, blocked storage) only means the defaults come back.
 */
import { create } from 'zustand';

interface Prefs {
  /** The tag `xray` runs in the terminal and on the Tools page; undefined = newest stable. */
  tag?: string;
  /** The Check page's chosen versions; undefined = the defaults. */
  checkTags?: string[];
  /** The first-run hint in the terminal was dismissed. */
  terminalHintSeen?: boolean;
}

interface PrefsState extends Prefs {
  set: (patch: Partial<Prefs>) => void;
}

const KEY = 'xray-lab-prefs';

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const v = JSON.parse(raw) as Prefs;
    return {
      tag: typeof v.tag === 'string' ? v.tag : undefined,
      checkTags: Array.isArray(v.checkTags) ? v.checkTags.filter(t => typeof t === 'string') : undefined,
      terminalHintSeen: v.terminalHintSeen === true,
    };
  } catch {
    return {};
  }
}

export const usePrefs = create<PrefsState>((set, get) => ({
  ...load(),
  set: patch => {
    set(patch);
    const { tag, checkTags, terminalHintSeen } = { ...get(), ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify({ tag, checkTags, terminalHintSeen }));
    } catch {
      // Not remembered.
    }
  },
}));
