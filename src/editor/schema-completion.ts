/**
 * Key and value completion in the config editors, from the schema of the
 * chosen core version (schema.ts).
 *
 * Where the cursor is comes from the JSON syntax tree (@codemirror/lang-json)
 * plus a look at the text right before it, which survives the half-typed
 * states a parser recovers from badly (`"pro` with no closing quote).
 */
import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete';
import { syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';
import { keysAt, valuesAt, type JsonSchema, type Segment, type Siblings } from './schema';

export interface Place {
  kind: 'key' | 'value';
  /** Where the text being replaced starts (the opening quote, if any). */
  from: number;
  /** Path of the object (for a key) or of the value. */
  path: Segment[];
  siblings: Siblings;
  /** Keys the object already has (not offered again). */
  existing: string[];
}

const literal = (state: EditorState, node: SyntaxNode): unknown => {
  const text = state.sliceDoc(node.from, node.to);
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

const nameOf = (state: EditorState, property: SyntaxNode): string | undefined => {
  const n = property.getChild('PropertyName');
  const v = n ? literal(state, n) : undefined;
  return typeof v === 'string' ? v : undefined;
};

/** Scalar members of an object node, for if/then on siblings. */
function valuesOf(state: EditorState, object: SyntaxNode): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (let p = object.firstChild; p; p = p.nextSibling) {
    if (p.name !== 'Property') continue;
    const name = nameOf(state, p);
    const value = p.lastChild;
    if (!name || !value || value.name === 'PropertyName') continue;
    if (['String', 'Number', 'True', 'False', 'Null'].includes(value.name)) out[name] = literal(state, value);
  }
  return out;
}

/** The path to a container node, and the sibling values along it. */
function pathTo(state: EditorState, container: SyntaxNode): { path: Segment[]; siblings: Siblings } {
  const path: Segment[] = [];
  const siblings: Siblings = [];
  let node: SyntaxNode | null = container;
  while (node) {
    siblings.unshift(node.name === 'Object' ? valuesOf(state, node) : {});
    const parent: SyntaxNode | null = node.parent;
    if (!parent || parent.name === 'JsonText') break;
    if (parent.name === 'Property') {
      path.unshift(nameOf(state, parent) ?? '');
      node = parent.parent;
    } else if (parent.name === 'Array') {
      let index = 0;
      for (let c = parent.firstChild; c && c.from < node.from; c = c.nextSibling) {
        if (!['[', ']', ',', '⚠', 'LineComment', 'BlockComment'].includes(c.name)) index++;
      }
      path.unshift(index);
      node = parent;
    } else {
      node = parent;
    }
  }
  return { path, siblings };
}

/** What sort of completion the cursor at `pos` wants, or null. */
export function placeAt(state: EditorState, pos: number): Place | null {
  // The token being typed: an open string, or a bare word (true, 12…). A
  // string cannot span lines, so the line up to the cursor says whether we
  // are inside one.
  const line = state.doc.lineAt(pos);
  const before = state.sliceDoc(line.from, pos);
  let openQuote = -1;
  for (let i = 0; i < before.length; i++) {
    const c = before[i];
    if (openQuote === -1) {
      if (c === '"') openQuote = i;
      else if (c === '/' && (before[i + 1] === '/' || before[i + 1] === '*')) break;
    } else if (c === '\\') i++;
    else if (c === '"') openQuote = -1;
  }
  const from = openQuote !== -1 ? line.from + openQuote : pos - (/[\w.-]*$/.exec(before)?.[0].length ?? 0);
  const prev = /(\S)\s*$/.exec(state.sliceDoc(Math.max(0, from - 200), from))?.[1];
  if (!prev || !'{[,:'.includes(prev)) return null;

  // The innermost Object or Array around the token.
  let container: SyntaxNode | null = syntaxTree(state).resolveInner(from, -1);
  while (container && container.name !== 'Object' && container.name !== 'Array') container = container.parent;
  if (!container || container.from >= from) return null;

  const { path, siblings } = pathTo(state, container);
  if (container.name === 'Object') {
    if (prev === ':') {
      // A value: its key is the string before the colon.
      const k = /"((?:[^"\\]|\\.)*)"\s*:\s*$/.exec(state.sliceDoc(Math.max(0, from - 200), from));
      if (!k) return null;
      return { kind: 'value', from, path: [...path, JSON.parse(`"${k[1]}"`) as string], siblings, existing: [] };
    }
    const existing: string[] = [];
    for (let p = container.firstChild; p; p = p.nextSibling) {
      if (p.name === 'Property' && !(p.from <= from && from <= p.to)) {
        const n = nameOf(state, p);
        if (n) existing.push(n);
      }
    }
    return { kind: 'key', from, path, siblings, existing };
  }
  // In an array: the element's index.
  let index = 0;
  for (let c = container.firstChild; c && c.to <= from; c = c.nextSibling) {
    if (!['[', ']', ',', '⚠', 'LineComment', 'BlockComment'].includes(c.name)) index++;
  }
  return { kind: 'value', from, path: [...path, index], siblings, existing: [] };
}

export function schemaCompletion(getSchema: () => JsonSchema | null): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const schema = getSchema();
    if (!schema) return null;
    const place = placeAt(ctx.state, ctx.pos);
    if (!place) return null;
    const typed = ctx.state.sliceDoc(place.from, ctx.pos);
    if (!ctx.explicit && typed.length === 0 && place.kind === 'key') return null;
    const closes = ctx.state.sliceDoc(ctx.pos, ctx.pos + 1) === '"';
    let options: Completion[];
    if (place.kind === 'key') {
      options = keysAt(schema, place.path, place.siblings)
        .filter(k => !place.existing.includes(k.key))
        .map(k => ({
          label: JSON.stringify(k.key),
          displayLabel: k.key,
          detail: k.type,
          info: k.description,
          type: 'property',
          boost: k.deprecated ? -10 : 0,
          apply: closes ? `${JSON.stringify(k.key)}`.slice(0, -1) : `${JSON.stringify(k.key)}: `,
        }));
    } else {
      options = valuesAt(schema, place.path, place.siblings).map(v => {
        const text = JSON.stringify(v);
        return { label: text, type: typeof v === 'string' ? 'enum' : 'keyword', apply: closes && typeof v === 'string' ? text.slice(0, -1) : text };
      });
    }
    if (!options.length) return null;
    return { from: place.from, to: ctx.pos, options, validFor: /^"?[\w.-]*$/ };
  };
}
