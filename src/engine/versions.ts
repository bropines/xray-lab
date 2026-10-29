/**
 * Ordering, grouping and the default choice of core versions.
 *
 * The library ships every Xray release from v26.3.27 up, and the set grows
 * by itself as XTLS releases, so nothing here lists versions except the two
 * the site has a reason to prefer: the one Remnawave nodes run and the
 * oldest build. Both are skipped if a manifest does not have them.
 */
import type { BuildInfo, Channel } from './contract';

/** What Remnawave nodes run today. */
export const REMNAWAVE_TAG = 'v26.7.28';
/** The oldest build the library makes. */
export const FLOOR_TAG = 'v26.3.27';
/** Releases XTLS withdrew; used only when a manifest has no `channel`. */
const KNOWN_WITHDRAWN = new Set(['v26.10.10']);

export const CHANNELS: readonly Channel[] = ['stable', 'prerelease', 'withdrawn'];

/** `v26.7.28` / `26.7.28` → `v26.7.28`; anything else is returned trimmed. */
export function normalizeTag(input: string): string {
  const s = input.trim();
  return /^\d+\.\d+/.test(s) ? `v${s}` : s;
}

/** Numeric parts of a tag (`v26.10.21` → [26, 10, 21]); a pre-release suffix sorts below the release. */
function parts(tag: string): { nums: number[]; suffix: string } {
  const m = /^v?(\d+(?:\.\d+)*)(.*)$/.exec(tag);
  if (!m) return { nums: [], suffix: tag };
  return { nums: (m[1] ?? '').split('.').map(Number), suffix: m[2] ?? '' };
}

/** Negative when `a` is older than `b`. */
export function compareTags(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i++) {
    const d = (pa.nums[i] ?? 0) - (pb.nums[i] ?? 0);
    if (d !== 0) return d;
  }
  if (pa.suffix === pb.suffix) return 0;
  if (!pa.suffix) return 1;
  if (!pb.suffix) return -1;
  return pa.suffix < pb.suffix ? -1 : 1;
}

export function channelOf(build: Pick<BuildInfo, 'tag' | 'channel'>): Channel {
  if (build.channel) return build.channel;
  if (KNOWN_WITHDRAWN.has(build.tag)) return 'withdrawn';
  return /-(alpha|beta|rc|pre)/i.test(build.tag) ? 'prerelease' : 'stable';
}

/** Newest first. */
export function sortBuilds<T extends Pick<BuildInfo, 'tag'>>(builds: readonly T[]): T[] {
  return [...builds].sort((a, b) => compareTags(b.tag, a.tag));
}

export function groupBuilds<T extends Pick<BuildInfo, 'tag' | 'channel'>>(builds: readonly T[]): Record<Channel, T[]> {
  const groups: Record<Channel, T[]> = { stable: [], prerelease: [], withdrawn: [] };
  for (const b of sortBuilds(builds)) groups[channelOf(b)].push(b);
  return groups;
}

export function newestStable<T extends Pick<BuildInfo, 'tag' | 'channel'>>(builds: readonly T[]): T | undefined {
  return sortBuilds(builds).find(b => channelOf(b) === 'stable') ?? sortBuilds(builds)[0];
}

/** Newest stable, the Remnawave one and the floor — whichever exist — newest first. */
export function defaultSelection(builds: readonly Pick<BuildInfo, 'tag' | 'channel'>[]): string[] {
  const have = new Set(builds.map(b => b.tag));
  const picks = [newestStable(builds)?.tag, REMNAWAVE_TAG, FLOOR_TAG].filter(
    (t): t is string => !!t && have.has(t),
  );
  return sortBuilds([...new Set(picks)].map(tag => ({ tag }))).map(b => b.tag);
}

export function allStable(builds: readonly Pick<BuildInfo, 'tag' | 'channel'>[]): string[] {
  return sortBuilds(builds).filter(b => channelOf(b) === 'stable').map(b => b.tag);
}

/** Matches a search box: `26.7`, `v26.7`, `pre`, `stable`. */
export function matchesQuery(build: Pick<BuildInfo, 'tag' | 'channel'>, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^v/, '');
  if (!q) return true;
  return build.tag.toLowerCase().replace(/^v/, '').includes(q) || channelOf(build).startsWith(q);
}

/** Resolves what a person typed (`26.7.28`, `v26.7.28`, `latest`) to a tag in the manifest. */
export function resolveTag(input: string, builds: readonly Pick<BuildInfo, 'tag' | 'channel'>[]): string | undefined {
  if (input === 'latest' || input === 'stable') return newestStable(builds)?.tag;
  const tag = normalizeTag(input);
  if (builds.some(b => b.tag === tag)) return tag;
  // A prefix (`26.9`) picks the newest build it names.
  return sortBuilds(builds).find(b => b.tag.startsWith(`${tag}.`))?.tag;
}
