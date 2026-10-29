/**
 * A config in a link, only when someone asks for one.
 *
 * The text is deflated (CompressionStream 'deflate-raw') and base64url-coded
 * into the URL *fragment* (`#/?z=…`): browsers never send a fragment to the
 * server, so GitHub Pages does not see it — but whoever gets the link gets the
 * config, keys included, and the page warns about exactly that.
 */
export const SHARE_PARAM = 'z';

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

export async function encodeShare(text: string): Promise<string> {
  return toBase64Url(await pipe(new TextEncoder().encode(text), new CompressionStream('deflate-raw')));
}

export async function decodeShare(data: string): Promise<string> {
  return new TextDecoder().decode(await pipe(fromBase64Url(data), new DecompressionStream('deflate-raw')));
}

/** The full link for a config: this page, with the data in the fragment. */
export async function shareUrl(text: string, here: string = location.href): Promise<string> {
  const url = new URL(here);
  url.hash = `#/?${SHARE_PARAM}=${await encodeShare(text)}`;
  return url.href;
}
