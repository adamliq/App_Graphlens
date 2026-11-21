/**
 * Tokenizer and recursive-descent parser for GraphLens's restricted,
 * GraphQL-like query language (see the Help page and USER_GUIDE.md for the
 * user-facing syntax guide). This module only turns query text into a plain
 * AST - it knows nothing about Splunk, SPL, or the settings-driven limits
 * that bound execution; see graphQueryExecutor.js for that.
 *
 * Deliberately hand-rolled rather than depending on the `graphql` npm
 * package: the supported grammar is a small, fixed subset (one root field,
 * no fragments/variables/aliases/directives/interfaces), and GraphLens's
 * existing convention (see splSafety.js) is to hand-write its own narrow
 * parsers/validators rather than add a general-purpose parsing dependency
 * whose much larger surface would need auditing for no benefit here.
 *
 * Grammar (informal):
 *   document      := 'query'? '{' field '}'
 *   field         := NAME arguments? selectionSet?
 *   arguments     := '(' argument (',' argument)* ')'
 *   argument      := NAME ':' value
 *   value         := STRING | INT | NAME            (a bare NAME is an enum value, e.g. OUTGOING)
 *   selectionSet  := '{' field+ '}'
 *
 * The document's single top-level field must be named `node` - enforced
 * here, not left to the executor, since it is a document-shape rule rather
 * than a data-dependent one.
 */
import { GraphLensValidationError } from '../utilities/splSafety';

export const MAX_QUERY_LENGTH = 10000;

// Defensive ceiling on selection-set nesting independent of any
// settings-driven depth limit (see graphQueryExecutor.js) - this exists
// purely to keep pathological input from building an enormous AST/call
// stack before semantic validation even runs.
const MAX_PARSE_DEPTH = 12;

const PUNCT_CHARS = '{}(),:';
const NAME_START = /[A-Za-z_]/;
const NAME_CONT = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function fail(message, pos) {
  const withPos = pos === undefined ? message : `${message} (position ${pos})`;
  throw new GraphLensValidationError(withPos, 'query');
}

function tokenize(source) {
  if (typeof source !== 'string' || source.trim().length === 0) {
    fail('Query text must not be empty.');
  }
  if (source.length > MAX_QUERY_LENGTH) {
    fail(`Query text exceeds the maximum length of ${MAX_QUERY_LENGTH} characters.`);
  }
  const tokens = [];
  const len = source.length;
  let i = 0;
  while (i < len) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i += 1; continue; }
    if (ch === '#') { while (i < len && source[i] !== '\n') i += 1; continue; }
    if (PUNCT_CHARS.includes(ch)) { tokens.push({ type: 'PUNCT', value: ch, pos: i }); i += 1; continue; }
    if (ch === '"') {
      const start = i;
      i += 1;
      let value = '';
      while (i < len && source[i] !== '"' && source[i] !== '\n') {
        if (source[i] === '\\' && i + 1 < len) {
          const escaped = source[i + 1];
          if (escaped === '"' || escaped === '\\') { value += escaped; } else if (escaped === 'n') { value += '\n'; } else { value += escaped; }
          i += 2;
          continue;
        }
        value += source[i];
        i += 1;
      }
      if (source[i] !== '"') fail('Unterminated string literal.', start);
      i += 1;
      tokens.push({ type: 'STRING', value, pos: start });
      continue;
    }
    if (DIGIT.test(ch) || (ch === '-' && DIGIT.test(source[i + 1] || ''))) {
      const start = i;
      if (ch === '-') i += 1;
      while (i < len && DIGIT.test(source[i])) i += 1;
      tokens.push({ type: 'INT', value: source.slice(start, i), pos: start });
      continue;
    }
    if (NAME_START.test(ch)) {
      const start = i;
      while (i < len && NAME_CONT.test(source[i])) i += 1;
      tokens.push({ type: 'NAME', value: source.slice(start, i), pos: start });
      continue;
    }
    fail(`Unexpected character "${ch}".`, i);
  }
  return tokens;
}

/** Builds a recursive-descent parser over a fixed token list. */
function createReader(tokens) {
  let i = 0;
  return {
    peek: () => tokens[i],
    next: () => tokens[i++],
    expectPunct(value) {
      const t = tokens[i];
      if (!t || t.type !== 'PUNCT' || t.value !== value) {
        fail(`Expected "${value}".`, t ? t.pos : undefined);
      }
      i += 1;
      return t;
    },
    expectName() {
      const t = tokens[i];
      if (!t || t.type !== 'NAME') {
        fail('Expected a name.', t ? t.pos : undefined);
      }
      i += 1;
      return t;
    },
    atEnd: () => i >= tokens.length,
  };
}

function isPunct(token, value) {
  return !!token && token.type === 'PUNCT' && token.value === value;
}

function parseValue(reader) {
  const t = reader.next();
  if (!t) fail('Expected an argument value.');
  if (t.type === 'STRING') return t.value;
  if (t.type === 'INT') return parseInt(t.value, 10);
  if (t.type === 'NAME') return { enum: t.value };
  fail('Expected a string, number or bare word value.', t.pos);
  return undefined;
}

function parseArguments(reader) {
  reader.expectPunct('(');
  const args = {};
  for (;;) {
    const nameTok = reader.expectName();
    reader.expectPunct(':');
    args[nameTok.value] = parseValue(reader);
    if (isPunct(reader.peek(), ',')) { reader.next(); continue; }
    break;
  }
  reader.expectPunct(')');
  return args;
}

function parseSelectionSet(reader, depth) {
  if (depth > MAX_PARSE_DEPTH) {
    fail(`Query nesting exceeds the maximum supported depth of ${MAX_PARSE_DEPTH}.`);
  }
  reader.expectPunct('{');
  const fields = [];
  while (!isPunct(reader.peek(), '}')) {
    if (!reader.peek()) fail('Unexpected end of query inside a selection set.');
    fields.push(parseField(reader, depth)); // eslint-disable-line no-use-before-define
  }
  reader.expectPunct('}');
  if (fields.length === 0) {
    fail('A selection set must contain at least one field.');
  }
  return fields;
}

function parseField(reader, depth) {
  const nameTok = reader.expectName();
  const args = isPunct(reader.peek(), '(') ? parseArguments(reader) : {};
  const selectionSet = isPunct(reader.peek(), '{') ? parseSelectionSet(reader, depth + 1) : null;
  return { name: nameTok.value, arguments: args, selectionSet, pos: nameTok.pos };
}

/**
 * Parses GraphLens query text into a plain-object AST:
 *   { type: 'Document', root: { name: 'node', arguments: {...}, selectionSet: [Field, ...] } }
 * Throws GraphLensValidationError on any syntax error, or if the document's
 * single top-level field is not named `node`.
 */
export function parseGraphQuery(source) {
  const tokens = tokenize(source);
  const reader = createReader(tokens);
  if (reader.peek() && reader.peek().type === 'NAME' && reader.peek().value === 'query') {
    reader.next();
  }
  reader.expectPunct('{');
  const root = parseField(reader, 1);
  reader.expectPunct('}');
  if (!reader.atEnd()) {
    fail('Unexpected content after the closing "}".', reader.peek().pos);
  }
  if (root.name !== 'node') {
    fail(`The query's single root field must be named "node", not "${root.name}".`, root.pos);
  }
  if (!root.selectionSet) {
    fail('The "node" root field needs a selection set, e.g. "node { id label }".');
  }
  return { type: 'Document', root };
}
