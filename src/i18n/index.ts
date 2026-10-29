/**
 * English and Russian, from two typed dictionaries.
 *
 * `en.ts` is the list of keys; `ru.ts` is typed `Record<Key, string>`, so a
 * missing translation fails `tsc`, and i18n.test.ts checks that both sides
 * use the same `{placeholders}`. The language is detected from
 * `navigator.languages` on the first visit and remembered per browser.
 */
import { create } from 'zustand';
import { en } from './en';
import { ru } from './ru';

export type Lang = 'en' | 'ru';
export type MessageKey = keyof typeof en;
export type Vars = Record<string, string | number>;

export const LANGS: readonly Lang[] = ['en', 'ru'];
export const DICTIONARIES: Record<Lang, Record<MessageKey, string>> = { en, ru };

const KEY = 'xray-lab-lang';

export function detectLang(languages: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : []): Lang {
  for (const l of languages) {
    const base = l.toLowerCase().split('-')[0];
    if (base === 'ru' || base === 'uk' || base === 'be' || base === 'kk') return 'ru';
    if (base === 'en') return 'en';
  }
  return 'en';
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ru') return saved;
  } catch {
    // Storage blocked.
  }
  return detectLang();
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  const text = DICTIONARIES[lang][key] ?? en[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

interface LangState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useLang = create<LangState>(set => ({
  lang: initialLang(),
  setLang: lang => {
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      // Not remembered; still switched.
    }
    if (typeof document !== 'undefined') document.documentElement.lang = lang;
    set({ lang });
  },
}));

export type T = (key: MessageKey, vars?: Vars) => string;

/** `t` for the current language; re-renders the component when it changes. */
export function useT(): T {
  const lang = useLang(s => s.lang);
  return (key, vars) => translate(lang, key, vars);
}

/** Outside React (the shell's messages are English on purpose; this is for the rest). */
export const t: T = (key, vars) => translate(useLang.getState().lang, key, vars);
