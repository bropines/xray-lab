import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from './en';
import { ru } from './ru';
import { detectLang, translate } from './index';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sources(p);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
  });
}

describe('i18n', () => {
  test('Russian has every key, nothing extra, nothing empty', () => {
    expect(Object.keys(ru).sort()).toEqual(Object.keys(en).sort());
    for (const [key, value] of Object.entries(ru)) expect(value.trim(), key).not.toBe('');
  });

  test('both languages use the same placeholders', () => {
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(ru[key]), key).toEqual(placeholders(en[key]));
    }
  });

  test('every key the code names exists, and every key is used', () => {
    const root = join(import.meta.dir, '..');
    const text = sources(root)
      .filter(p => !p.includes(`${join('i18n', 'en.ts')}`) && !p.includes(`${join('i18n', 'ru.ts')}`))
      .map(p => readFileSync(p, 'utf8'))
      .join('\n');
    const named = new Set([...text.matchAll(/['"]((?:common|nav|shell|versions|check|confirm|results|verdict|geo|explain|share|terminal|tools|about)\.[\w.]+)['"]/g)].map(m => m[1]));
    for (const key of named) expect(!!key && key in en, `${key} is used but not in en.ts`).toBe(true);
    for (const key of Object.keys(en)) expect(named.has(key), `${key} is in en.ts but not used`).toBe(true);
  });

  test('interpolates and detects the language', () => {
    expect(translate('en', 'check.run', { n: 3 })).toBe('Check on 3 versions');
    expect(translate('ru', 'check.run', { n: 3 })).toBe('Проверить на версиях: 3');
    expect(detectLang(['ru-RU', 'en'])).toBe('ru');
    expect(detectLang(['de-DE', 'en-US'])).toBe('en');
    expect(detectLang(['fr'])).toBe('en');
  });
});
