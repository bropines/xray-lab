/**
 * geoip.dat / geosite.dat for configs with `geoip:` / `geosite:` rules.
 *
 * The core reads them while it loads the config, so without them such a
 * config cannot be judged (`inconclusive`). They can be uploaded, or fetched
 * from Loyalsoldier/v2ray-rules-dat's `release` branch — through jsDelivr
 * first, raw.githubusercontent.com second. Both answered a request from a
 * foreign origin with `Access-Control-Allow-Origin: *` when this was written
 * (2026-10); the files are about 17 and 11 MB.
 */
import { ASSET_DIR } from '../engine/contract';

export type GeoName = 'geoip.dat' | 'geosite.dat';

export const GEO_FILES: { name: GeoName; approxBytes: number; prefix: string }[] = [
  { name: 'geoip.dat', approxBytes: 16_600_000, prefix: 'geoip:' },
  { name: 'geosite.dat', approxBytes: 11_300_000, prefix: 'geosite:' },
];

export const GEO_SOURCE_NAME = 'Loyalsoldier/v2ray-rules-dat';
export const GEO_SOURCE_URL = 'https://github.com/Loyalsoldier/v2ray-rules-dat';

export const geoUrls = (name: GeoName) => [
  `https://cdn.jsdelivr.net/gh/Loyalsoldier/v2ray-rules-dat@release/${name}`,
  `https://raw.githubusercontent.com/Loyalsoldier/v2ray-rules-dat/release/${name}`,
];

export const geoPath = (name: string) => `${ASSET_DIR}/${name}`;

/** Which geo files and `ext:` files a config's text refers to. */
export function geoReferences(text: string): { geoip: boolean; geosite: boolean; ext: string[] } {
  const ext = new Set<string>();
  for (const m of text.matchAll(/"ext(?:-domain|-ip)?:([^:"]+):/g)) if (m[1]) ext.add(m[1]);
  return {
    geoip: /"(?:geoip|!geoip):/.test(text),
    geosite: /"geosite:/.test(text),
    ext: [...ext],
  };
}

/** A .dat is a protobuf list: it starts with field 1, length-delimited (0x0a). */
export const looksLikeDat = (data: Uint8Array) => data.length > 16 && data[0] === 0x0a;

export async function fetchGeo(
  name: GeoName,
  onProgress: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const approx = GEO_FILES.find(f => f.name === name)?.approxBytes ?? 0;
  let lastError: unknown;
  for (const url of geoUrls(name)) {
    try {
      const res = await fetch(url, { signal, mode: 'cors', credentials: 'omit' });
      if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText} from ${new URL(url).host}`);
      const total = Number(res.headers.get('content-length')) || approx;
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let loaded = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        onProgress(loaded, Math.max(total, loaded));
      }
      const out = new Uint8Array(loaded);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      if (!looksLikeDat(out)) throw new Error(`${new URL(url).host} did not return a .dat file`);
      return out;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
