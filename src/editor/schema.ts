/**
 * What the JSON Schema of a core version allows at a place in a config —
 * enough for key and value completion in the editors.
 *
 * Schemas come from xray-schema (one per release tag, generated from that
 * tag's source) through jsDelivr, which sends `Access-Control-Allow-Origin:
 * *`. A missing or unreachable schema just means no suggestions.
 *
 * The walk understands what those schemas use: `$ref` into `$defs`,
 * `anyOf`/`oneOf`/`allOf`, `if`/`then`/`else` on sibling values (`protocol`
 * picks the shape of `settings`), `properties`, `additionalProperties`,
 * `items`, `enum` and `const`. Anything else is ignored rather than guessed.
 */
export type JsonSchema = {
  $ref?: string;
  $defs?: Record<string, JsonSchema>;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  additionalProperties?: JsonSchema | boolean;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  if?: JsonSchema;
  then?: JsonSchema;
  else?: JsonSchema;
  enum?: unknown[];
  const?: unknown;
  description?: string;
  markdownDescription?: string;
  deprecated?: boolean;
  required?: string[];
};

export const SCHEMA_VERSION = 'v0.1.0';
export const schemaUrl = (tag: string) => `https://cdn.jsdelivr.net/gh/bropines/xray-schema@${SCHEMA_VERSION}/schema/${tag}.schema.json`;
export const SCHEMA_REPO = 'https://github.com/bropines/xray-schema';

const cache = new Map<string, Promise<JsonSchema | null>>();

export function loadSchema(tag: string, f: (url: string) => Promise<Response> = url => fetch(url)): Promise<JsonSchema | null> {
  let p = cache.get(tag);
  if (!p) {
    p = f(schemaUrl(tag))
      .then(r => (r.ok ? (r.json() as Promise<JsonSchema>) : null))
      .catch(() => null);
    cache.set(tag, p);
    // An offline moment should not stick.
    void p.then(s => { if (!s) cache.delete(tag); });
  }
  return p;
}

/** Path segment: an object key or an array index. */
export type Segment = string | number;
/** Sibling values known at each level of the path (for if/then), outermost first. */
export type Siblings = Array<Record<string, unknown>>;

function deref(root: JsonSchema, s: JsonSchema | boolean | undefined, seen = new Set<string>()): JsonSchema | undefined {
  if (!s || s === true) return s === true ? {} : undefined;
  if (s.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(s.$ref);
    if (!m || seen.has(s.$ref)) return undefined;
    seen.add(s.$ref);
    const target = root.$defs?.[decodeURIComponent((m[1] ?? '').replace(/~1/g, '/').replace(/~0/g, '~'))];
    const { $ref: _ref, ...rest } = s;
    const resolved = deref(root, target, seen);
    return resolved ? { ...resolved, ...rest, description: rest.description ?? resolved.description } : undefined;
  }
  return s;
}

function matches(cond: JsonSchema, values: Record<string, unknown>): boolean {
  for (const [key, sub] of Object.entries(cond.properties ?? {})) {
    if (!(key in values)) return false;
    const v = values[key];
    if ('const' in sub && sub.const !== v) return false;
    if (sub.enum && !sub.enum.includes(v)) return false;
  }
  for (const key of cond.required ?? []) if (!(key in values)) return false;
  return true;
}

/** Every concrete schema a value at this point may be checked against. */
export function flatten(root: JsonSchema, s: JsonSchema | boolean | undefined, values: Record<string, unknown> = {}, depth = 0): JsonSchema[] {
  const d = deref(root, s);
  if (!d || depth > 12) return [];
  const out: JsonSchema[] = [d];
  for (const branch of [...(d.anyOf ?? []), ...(d.oneOf ?? []), ...(d.allOf ?? [])]) out.push(...flatten(root, branch, values, depth + 1));
  if (d.if) {
    const next = matches(d.if, values) ? d.then : d.else;
    if (next) out.push(...flatten(root, next, values, depth + 1));
  }
  return out;
}

/** The schemas that apply at `path`, given the sibling values along the way. */
export function schemasAt(root: JsonSchema, path: Segment[], siblings: Siblings = []): JsonSchema[] {
  let current = flatten(root, root, siblings[0] ?? {});
  for (let i = 0; i < path.length; i++) {
    const seg = path[i] as Segment;
    const values = siblings[i + 1] ?? {};
    const next: JsonSchema[] = [];
    for (const s of current) {
      if (typeof seg === 'number') {
        if (s.items) next.push(...flatten(root, s.items, values));
      } else if (s.properties?.[seg]) {
        next.push(...flatten(root, s.properties[seg], values));
      } else if (s.additionalProperties && typeof s.additionalProperties === 'object' && Object.keys(s.additionalProperties).length) {
        next.push(...flatten(root, s.additionalProperties, values));
      }
    }
    current = next;
    if (!current.length) break;
  }
  return current;
}

export interface KeySuggestion {
  key: string;
  description?: string;
  deprecated?: boolean;
  type?: string;
}

/** Keys an object at `path` may have. */
export function keysAt(root: JsonSchema, path: Segment[], siblings: Siblings = []): KeySuggestion[] {
  const out = new Map<string, KeySuggestion>();
  for (const s of schemasAt(root, path, siblings)) {
    for (const [key, sub] of Object.entries(s.properties ?? {})) {
      if (out.has(key)) continue;
      const d = deref(root, sub);
      const type = d?.type ?? (d?.anyOf ? d.anyOf.map(x => deref(root, x)?.type).filter(Boolean).join(' | ') : undefined);
      out.set(key, { key, description: d?.description ?? sub.description, deprecated: d?.deprecated, type: Array.isArray(type) ? type.join(' | ') : type });
    }
  }
  return [...out.values()];
}

/** Literal values (enum / const) a value at `path` may take. */
export function valuesAt(root: JsonSchema, path: Segment[], siblings: Siblings = []): unknown[] {
  const out: unknown[] = [];
  const add = (v: unknown) => {
    if (!out.some(x => x === v)) out.push(v);
  };
  for (const s of schemasAt(root, path, siblings)) {
    for (const v of s.enum ?? []) add(v);
    if ('const' in s) add(s.const);
    if (s.type === 'boolean') {
      add(true);
      add(false);
    }
  }
  return out;
}
