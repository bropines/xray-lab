/**
 * A hash router: GitHub Pages has no SPA fallback, so every page lives after
 * `#`. `#/terminal`, `#/tools`, `#/about`; `#/` is Check. A query inside the
 * hash carries page state that is safe to put in a link (`#/?versions=all`)
 * and, only when someone presses Share, a compressed config (`#/?z=…`).
 */
import { useSyncExternalStore } from 'react';

export const ROUTES = ['check', 'terminal', 'tools', 'about'] as const;
export type Route = (typeof ROUTES)[number];

export interface Location {
  route: Route;
  params: URLSearchParams;
}

export function parseHash(hash: string): Location {
  const body = hash.replace(/^#/, '');
  const [path = '', query = ''] = body.split('?');
  const name = path.replace(/^\/+|\/+$/g, '');
  const route = (ROUTES as readonly string[]).includes(name) ? (name as Route) : 'check';
  return { route, params: new URLSearchParams(query) };
}

export function hrefOf(route: Route, params?: Record<string, string>): string {
  const q = params && Object.keys(params).length ? `?${new URLSearchParams(params)}` : '';
  return `#/${route === 'check' ? '' : route}${q}`;
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useLocation(): Location {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => '');
  return parseHash(hash);
}

export function navigate(route: Route, params?: Record<string, string>): void {
  location.hash = hrefOf(route, params);
}

/** Drops the query from the hash without adding a history entry (used after reading a shared config). */
export function clearHashQuery(): void {
  const { route } = parseHash(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}${hrefOf(route)}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
