import { describe, expect, test } from 'bun:test';
import {
  allStable,
  channelOf,
  compareTags,
  defaultSelection,
  groupBuilds,
  matchesQuery,
  newestStable,
  normalizeTag,
  resolveTag,
  sortBuilds,
} from './versions';

const builds = [
  { tag: 'v26.3.27', channel: 'prerelease' as const },
  { tag: 'v26.10.21', channel: 'stable' as const },
  { tag: 'v26.10.10', channel: 'withdrawn' as const },
  { tag: 'v26.9.9', channel: 'prerelease' as const },
  { tag: 'v26.7.28', channel: 'stable' as const },
  { tag: 'v26.9.30', channel: 'prerelease' as const },
];

describe('versions', () => {
  test('compares numerically, not as text', () => {
    expect(compareTags('v26.10.21', 'v26.9.30')).toBeGreaterThan(0);
    expect(compareTags('v26.9.9', 'v26.9.30')).toBeLessThan(0);
    expect(compareTags('v26.7.28', 'v26.7.28')).toBe(0);
    expect(compareTags('v26.7.28-beta', 'v26.7.28')).toBeLessThan(0);
  });

  test('sorts newest first', () => {
    expect(sortBuilds(builds).map(b => b.tag)).toEqual(['v26.10.21', 'v26.10.10', 'v26.9.30', 'v26.9.9', 'v26.7.28', 'v26.3.27']);
  });

  test('groups by channel', () => {
    const g = groupBuilds(builds);
    expect(g.stable.map(b => b.tag)).toEqual(['v26.10.21', 'v26.7.28']);
    expect(g.prerelease.map(b => b.tag)).toEqual(['v26.9.30', 'v26.9.9', 'v26.3.27']);
    expect(g.withdrawn.map(b => b.tag)).toEqual(['v26.10.10']);
  });

  test('guesses the channel when a manifest has none', () => {
    expect(channelOf({ tag: 'v26.10.10' })).toBe('withdrawn');
    expect(channelOf({ tag: 'v26.7.28' })).toBe('stable');
    expect(channelOf({ tag: 'v26.7.28-rc1' })).toBe('prerelease');
  });

  test('defaults: newest stable, the Remnawave one, the floor', () => {
    expect(defaultSelection(builds)).toEqual(['v26.10.21', 'v26.7.28', 'v26.3.27']);
    expect(newestStable(builds)?.tag).toBe('v26.10.21');
    // Missing ones are skipped, not invented.
    expect(defaultSelection([{ tag: 'v26.10.21', channel: 'stable' }])).toEqual(['v26.10.21']);
    expect(allStable(builds)).toEqual(['v26.10.21', 'v26.7.28']);
  });

  test('resolves what people type', () => {
    expect(normalizeTag('26.7.28')).toBe('v26.7.28');
    expect(resolveTag('26.7.28', builds)).toBe('v26.7.28');
    expect(resolveTag('v26.9.9', builds)).toBe('v26.9.9');
    expect(resolveTag('latest', builds)).toBe('v26.10.21');
    expect(resolveTag('26.9', builds)).toBe('v26.9.30');
    expect(resolveTag('25.1.1', builds)).toBeUndefined();
  });

  test('search matches tags and channels', () => {
    expect(matchesQuery({ tag: 'v26.10.21', channel: 'stable' }, '26.10')).toBe(true);
    expect(matchesQuery({ tag: 'v26.10.21', channel: 'stable' }, 'v26.10')).toBe(true);
    expect(matchesQuery({ tag: 'v26.9.9', channel: 'prerelease' }, 'pre')).toBe(true);
    expect(matchesQuery({ tag: 'v26.9.9', channel: 'prerelease' }, '26.10')).toBe(false);
  });
});
