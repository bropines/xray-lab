import { describe, expect, test } from 'bun:test';
import { json } from '@codemirror/lang-json';
import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { keysAt, valuesAt, type JsonSchema } from './schema';
import { placeAt } from './schema-completion';

/** The shape xray-schema uses, cut down: $defs, anyOf enums, allOf if/then on protocol. */
const schema: JsonSchema = {
  type: 'object',
  properties: {
    log: { type: 'object', properties: { loglevel: { type: 'string', enum: ['debug', 'info', 'warning', 'error', 'none'] } } },
    inbounds: { type: 'array', items: { $ref: '#/$defs/inbound' } },
  },
  $defs: {
    inbound: {
      type: 'object',
      properties: {
        tag: { type: 'string', description: 'Inbound tag' },
        protocol: { anyOf: [{ type: 'string', enum: ['vless', 'socks'] }, { type: 'string' }] },
        settings: { type: 'object', additionalProperties: {} },
        sniffing: { $ref: '#/$defs/sniffing', description: 'Content sniffing' },
      },
      allOf: [
        { if: { properties: { protocol: { const: 'vless' } }, required: ['protocol'] }, then: { properties: { settings: { $ref: '#/$defs/vless' } } } },
        { if: { properties: { protocol: { const: 'socks' } }, required: ['protocol'] }, then: { properties: { settings: { $ref: '#/$defs/socks' } } } },
      ],
    },
    vless: { type: 'object', properties: { clients: { type: 'array' }, decryption: { type: 'string' } } },
    socks: { type: 'object', properties: { auth: { type: 'string', enum: ['noauth', 'password'] }, udp: { type: 'boolean' } } },
    sniffing: { type: 'object', properties: { enabled: { type: 'boolean' } } },
  },
};

const keys = (path: (string | number)[], siblings?: Record<string, unknown>[]) => keysAt(schema, path, siblings).map(k => k.key);

describe('schema walk', () => {
  test('keys at the root and through $ref', () => {
    expect(keys([])).toEqual(['log', 'inbounds']);
    expect(keys(['inbounds', 0])).toEqual(['tag', 'protocol', 'settings', 'sniffing']);
    expect(keys(['inbounds', 0, 'sniffing'])).toEqual(['enabled']);
    expect(keysAt(schema, ['inbounds', 0]).find(k => k.key === 'tag')?.description).toBe('Inbound tag');
  });

  test('if/then follows the sibling protocol', () => {
    expect(keys(['inbounds', 0, 'settings'], [{}, {}, { protocol: 'vless' }])).toEqual(['clients', 'decryption']);
    expect(keys(['inbounds', 0, 'settings'], [{}, {}, { protocol: 'socks' }])).toEqual(['auth', 'udp']);
    expect(keys(['inbounds', 0, 'settings'], [{}, {}, {}])).toEqual([]);
  });

  test('values: enums through anyOf, booleans', () => {
    expect(valuesAt(schema, ['log', 'loglevel'])).toEqual(['debug', 'info', 'warning', 'error', 'none']);
    expect(valuesAt(schema, ['inbounds', 0, 'protocol'])).toEqual(['vless', 'socks']);
    expect(valuesAt(schema, ['inbounds', 0, 'sniffing', 'enabled'])).toEqual([true, false]);
  });
});

function at(text: string) {
  const pos = text.indexOf('|');
  const doc = text.replace('|', '');
  const state = EditorState.create({ doc, extensions: [json()] });
  ensureSyntaxTree(state, doc.length, 5000);
  return placeAt(state, pos);
}

describe('placeAt', () => {
  test('a key being typed in a nested object', () => {
    const p = at('{"inbounds": [{"protocol": "socks", "settings": {"u|"}}]}');
    expect(p?.kind).toBe('key');
    expect(p?.path).toEqual(['inbounds', 0, 'settings']);
    expect(p?.siblings[2]).toEqual({ protocol: 'socks' });
    expect(keysAt(schema, p?.path ?? [], p?.siblings).map(k => k.key)).toEqual(['auth', 'udp']);
  });

  test('a value after a colon', () => {
    const p = at('{"log": {"loglevel": "w|"}}');
    expect(p?.kind).toBe('value');
    expect(p?.path).toEqual(['log', 'loglevel']);
  });

  test('the second array element', () => {
    const p = at('{"inbounds": [{"tag": "a"}, {"|"}]}');
    expect(p?.path).toEqual(['inbounds', 1]);
  });

  test('existing keys are known, and nothing is offered outside a container', () => {
    expect(at('{"log": {}, |}')?.existing).toEqual(['log']);
    expect(at('|')).toBeNull();
  });
});
