/**
 * Reading what the key commands print, to show each value with its own copy
 * button. The raw output is always shown too; this only adds convenience,
 * and anything it does not recognise is simply not turned into a field.
 *
 * Formats, from main/commands/all/*.go of v26.10.21:
 *   x25519 / wg   `PrivateKey: …\nPassword (PublicKey): …\nHash32: …`
 *   mldsa65       `Seed: …\nVerify: …`
 *   mlkem768      `Seed: …\nClient: …\nHash32: …`
 *   vlessenc      `Authentication: …` headings, then `"decryption": "…"` / `"encryption": "…"`
 *   tls cert      JSON `{ "certificate": [lines], "key": [lines] }`
 */
export type OutputItem = { kind: 'field'; label: string; value: string } | { kind: 'heading'; text: string };

export function parseFields(stdout: string): OutputItem[] {
  const items: OutputItem[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const quoted = /^"([\w-]+)":\s*"(.*)",?$/.exec(line);
    if (quoted) {
      items.push({ kind: 'field', label: quoted[1] as string, value: quoted[2] as string });
      continue;
    }
    const heading = /^Authentication:\s*(.+)$/.exec(line);
    if (heading) {
      items.push({ kind: 'heading', text: heading[1] as string });
      continue;
    }
    const kv = /^([A-Za-z][\w ()/-]{0,40}?):\s+(\S+)$/.exec(line);
    if (kv) items.push({ kind: 'field', label: kv[1] as string, value: kv[2] as string });
  }
  return items;
}

export interface CertPem {
  certificate: string;
  key: string;
}

export function parseCertJson(stdout: string): CertPem | null {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(stdout.slice(start, end + 1)) as { certificate?: unknown; key?: unknown };
    if (!Array.isArray(v.certificate) || !Array.isArray(v.key)) return null;
    return { certificate: `${v.certificate.join('\n')}\n`, key: `${v.key.join('\n')}\n` };
  } catch {
    return null;
  }
}

/** The first UUID in the output (`uuid` prints just that). */
export function parseUuid(stdout: string): string | null {
  return /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(stdout)?.[0] ?? null;
}

/** `example.com, *.example.com  other` → three names. */
export function splitDomains(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map(s => s.trim())
    .filter(Boolean);
}
