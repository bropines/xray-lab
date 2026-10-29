/** `12_400_000` → `12.4 MB` (decimal megabytes, as download sizes are usually given). */
export function formatBytes(bytes: number, locale = 'en'): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = locale.startsWith('ru') ? ['Б', 'КБ', 'МБ', 'ГБ'] : ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = i === 0 ? 0 : v >= 100 ? 0 : 1;
  return `${v.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })} ${units[i]}`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
}

export function percent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}
