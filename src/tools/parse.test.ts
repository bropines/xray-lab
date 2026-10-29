import { describe, expect, test } from 'bun:test';
import { parseCertJson, parseFields, parseUuid, splitDomains } from './parse';

describe('output parsers', () => {
  test('x25519 / wg', () => {
    const out = 'PrivateKey: aaa\nPassword (PublicKey): bbb\nHash32: ccc\n';
    expect(parseFields(out)).toEqual([
      { kind: 'field', label: 'PrivateKey', value: 'aaa' },
      { kind: 'field', label: 'Password (PublicKey)', value: 'bbb' },
      { kind: 'field', label: 'Hash32', value: 'ccc' },
    ]);
  });

  test('vlessenc: headings and quoted pairs, the preamble skipped', () => {
    const out =
      'Choose one Authentication to use, do not mix them. Ephemeral key exchange is Post-Quantum safe anyway.\n\n' +
      'Authentication: X25519, not Post-Quantum\n"decryption": "d1"\n"encryption": "e1"\n\n' +
      'Authentication: ML-KEM-768, Post-Quantum\n"decryption": "d2"\n"encryption": "e2"\n';
    expect(parseFields(out)).toEqual([
      { kind: 'heading', text: 'X25519, not Post-Quantum' },
      { kind: 'field', label: 'decryption', value: 'd1' },
      { kind: 'field', label: 'encryption', value: 'e1' },
      { kind: 'heading', text: 'ML-KEM-768, Post-Quantum' },
      { kind: 'field', label: 'decryption', value: 'd2' },
      { kind: 'field', label: 'encryption', value: 'e2' },
    ]);
  });

  test('tls cert JSON', () => {
    const out = JSON.stringify({ certificate: ['-----BEGIN CERTIFICATE-----', 'AA', '-----END CERTIFICATE-----'], key: ['k1', 'k2'] }, null, 2);
    expect(parseCertJson(out)).toEqual({ certificate: '-----BEGIN CERTIFICATE-----\nAA\n-----END CERTIFICATE-----\n', key: 'k1\nk2\n' });
    expect(parseCertJson('nope')).toBeNull();
  });

  test('uuid and domains', () => {
    expect(parseUuid('2d8cf0f3-6c4b-4f0e-9b59-4b8a1c0d2e3f\n')).toBe('2d8cf0f3-6c4b-4f0e-9b59-4b8a1c0d2e3f');
    expect(splitDomains(' example.com, www.example.com  test.example.com ')).toEqual(['example.com', 'www.example.com', 'test.example.com']);
  });
});
