import { create } from 'zustand';

/**
 * Light, dark, or whatever the system says.
 *
 * Applied by toggling `dark` on <html>: the tokens in `src/index.css` have a
 * light `:root` set and a `.dark` set, and every component reads the tokens.
 * `index.html` carries `class="dark"` as the no-JS default and an inline
 * script that applies the saved preference before the first paint, so this
 * module only has to keep it right afterwards — and follow the system while
 * the preference is `system`.
 *
 * Per viewer, in localStorage. The
 * storage key and the values are read by that inline script too; change them
 * in both places.
 */
export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

export const THEME_KEY = 'xray-lab-theme';

const read = (): ThemePreference => {
    try {
        const saved = localStorage.getItem(THEME_KEY);
        if (saved === 'system' || saved === 'dark' || saved === 'light') return saved;
    } catch {
        // Storage blocked: fall through to the default.
    }
    return 'system';
};

const systemQuery = (): MediaQueryList | null =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;

export const resolveTheme = (preference: ThemePreference, systemDark: boolean): ResolvedTheme =>
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

const apply = (resolved: ResolvedTheme) => {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', resolved === 'dark');
};

interface ThemeState {
    preference: ThemePreference;
    resolved: ResolvedTheme;
    setPreference: (preference: ThemePreference) => void;
}

const initial = read();

export const useTheme = create<ThemeState>(set => ({
    preference: initial,
    resolved: resolveTheme(initial, systemQuery()?.matches ?? true),
    setPreference: preference => {
        try {
            localStorage.setItem(THEME_KEY, preference);
        } catch {
            // Not persisting is survivable.
        }
        const resolved = resolveTheme(preference, systemQuery()?.matches ?? true);
        apply(resolved);
        set({ preference, resolved });
    },
}));

/** Call once at startup: applies the preference and follows the system. */
export const initTheme = () => {
    const query = systemQuery();
    apply(useTheme.getState().resolved);
    query?.addEventListener?.('change', event => {
        const { preference } = useTheme.getState();
        if (preference !== 'system') return;
        const resolved = resolveTheme(preference, event.matches);
        apply(resolved);
        useTheme.setState({ resolved });
    });
};
