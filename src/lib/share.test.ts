import { describe, expect, test } from 'bun:test';
import { decodeShare, encodeShare, shareUrl } from './share';

describe('share links', () => {
  test('round-trips a config, Unicode included', async () => {
    const text = '{\n  // комментарий\n  "log": {"loglevel": "warning"}\n}\n'.repeat(20);
    const data = await encodeShare(text);
    expect(data).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(data.length).toBeLessThan(text.length);
    expect(await decodeShare(data)).toBe(text);
  });

  test('puts the data in the fragment only', async () => {
    const url = new URL(await shareUrl('{}', 'https://example.com/xray-lab/?x=1#/terminal'));
    expect(url.search).toBe('?x=1');
    expect(url.hash.startsWith('#/?z=')).toBe(true);
  });
});
