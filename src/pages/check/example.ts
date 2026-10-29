/**
 * The example config: a minimal VLESS + REALITY server.
 *
 * Its keys are made on the spot from the browser's random generator — any 32
 * random bytes are a valid X25519 private key once clamped, which the core
 * does itself — so no two visitors get the same one and nothing in the repo
 * is a real key. Names are example.com and private addresses only.
 *
 * It carries a comment and a trailing comma on purpose: the checker strips
 * them and says so.
 */
function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomHex(n: number): string {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function exampleConfig(): string {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return `{
  // A minimal VLESS + REALITY server. The UUID and the key were generated in
  // your browser just now; nothing here is anyone's real server.
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "tag": "vless-reality",
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [{ "id": "${crypto.randomUUID()}", "flow": "xtls-rprx-vision" }],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "target": "example.com:443",
          "serverNames": ["example.com"],
          "privateKey": "${b64url(key)}",
          "shortIds": ["${randomHex(8)}"]
        }
      },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
    }
  ],
  "outbounds": [
    { "tag": "direct", "protocol": "freedom" },
    { "tag": "block", "protocol": "blackhole" },
  ],
  "routing": {
    "rules": [
      { "ip": ["10.0.0.0/8", "192.168.0.0/16"], "outboundTag": "block" }
    ]
  }
}
`;
}
