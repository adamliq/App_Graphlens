/**
 * Input validation and escaping used everywhere GraphLens turns
 * user-controlled data into a Splunk search token, a KV Store record, or
 * exported content. Nothing in this module ever concatenates untrusted
 * input directly into SPL without first passing it through here.
 *
 * Defence in depth: the same identifier grammar is enforced again inside
 * the saved-search macros (see default/macros.conf, graphlens_valid_id and
 * graphlens_valid_type_token) so a bug in this file is not the only thing
 * standing between user input and a search.
 */

export class GraphLensValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'GraphLensValidationError';
    this.field = field;
  }
}

// Namespaced, stable identifier grammar: "type:value[:value...]".
// Deliberately excludes quotes, backslashes, pipes, wildcards, whitespace
// and control characters so it is safe to embed in SPL, HTML attributes,
// Cytoscape.js element ids and KV Store _key values without escaping.
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:_\-.@/]{0,254}$/;

// Relationship/node "type" tokens: short, upper/lower snake case.
export const TYPE_TOKEN_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// Splunk index and sourcetype name grammars. These are intentionally
// stricter than the general ID_PATTERN because index/sourcetype values are
// substituted unquoted into SPL (e.g. index=$token$) by the saved-search
// dispatch layer, so they must never be able to carry a space, pipe or
// quote even though, unlike a free-form node id, they come from event
// fields the current user's search already returned.
export const INDEX_NAME_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
export const SOURCETYPE_PATTERN = /^[A-Za-z0-9_:.-]{1,150}$/;

export const LAYOUT_ALLOWLIST = Object.freeze(['cose', 'concentric', 'breadthfirst', 'circle', 'grid']);
export const EXPORT_FORMAT_ALLOWLIST = Object.freeze(['json', 'csv-nodes', 'csv-edges', 'png']);
export const TARGET_KIND_ALLOWLIST = Object.freeze(['node', 'edge']);
export const SHARING_ALLOWLIST = Object.freeze(['private', 'app']);

// All ASCII control characters (0x00-0x1F) plus DEL (0x7F).
// Two copies are kept deliberately: a non-global one for .test() (a global
// regex's lastIndex is stateful across calls and would give wrong results
// here) and a global one for stripping every occurrence with .replace().
const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/; // eslint-disable-line no-control-regex
const CONTROL_CHAR_PATTERN_GLOBAL = /[\x00-\x1f\x7f]/g; // eslint-disable-line no-control-regex
const CRLF_PATTERN = /[\r\n]/;

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** Throws GraphLensValidationError unless `id` is a safe namespaced identifier. */
export function assertValidId(id, field = 'id') {
  if (!isNonEmptyString(id) || id.length > 255 || CONTROL_CHAR_PATTERN.test(id) || !ID_PATTERN.test(id)) {
    throw new GraphLensValidationError(`Invalid identifier for ${field}.`, field);
  }
  return id;
}

export function isValidId(id) {
  try {
    assertValidId(id);
    return true;
  } catch (err) {
    return false;
  }
}

/** Throws unless `token` is a safe type token (node type / relationship type / layout name / etc). */
export function assertValidTypeToken(token, field = 'type') {
  if (!isNonEmptyString(token) || CONTROL_CHAR_PATTERN.test(token) || !TYPE_TOKEN_PATTERN.test(token)) {
    throw new GraphLensValidationError(`Invalid ${field} token.`, field);
  }
  return token;
}

/** Throws unless `value` is a member of `allowlist` (exact match, case-sensitive). */
export function assertAllowlisted(value, allowlist, field = 'value') {
  if (!allowlist.includes(value)) {
    throw new GraphLensValidationError(`${field} "${String(value)}" is not permitted.`, field);
  }
  return value;
}

/**
 * Clamp/validate an integer limit (expansion size, page size, path depth,
 * etc). Never trusts the caller: returns `fallback` for anything that is
 * not a finite, non-negative integer, and clamps to [min, max].
 */
export function clampInteger(value, { min = 0, max = Number.MAX_SAFE_INTEGER, fallback = min } = {}) {
  const num = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(num) || !Number.isInteger(num)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, num));
}

/**
 * Escape a value for safe embedding inside a double-quoted SPL string
 * literal (e.g. source_id="$escaped$"). This is a defence-in-depth
 * measure used in addition to, never instead of, identifier/token
 * allowlisting above.
 */
export function escapeSplStringLiteral(value) {
  if (!isNonEmptyString(value)) {
    throw new GraphLensValidationError('Cannot escape an empty value for SPL.', 'value');
  }
  if (CONTROL_CHAR_PATTERN.test(value) || CRLF_PATTERN.test(value)) {
    throw new GraphLensValidationError('Value contains disallowed control characters.', 'value');
  }
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/**
 * Sanitise a free-text search term (the entity search box). Unlike node
 * and edge identifiers, this may contain spaces and mixed case, but must
 * not carry SPL metacharacters, wildcards supplied by the user (GraphLens
 * appends its own trailing wildcard), or control characters.
 */
export function sanitizeSearchTerm(term, { maxLength = 100 } = {}) {
  if (!isNonEmptyString(term)) {
    throw new GraphLensValidationError('Search term must not be empty.', 'term');
  }
  const trimmed = term.trim().slice(0, maxLength);
  if (trimmed.length === 0) {
    throw new GraphLensValidationError('Search term must not be empty.', 'term');
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed) || CRLF_PATTERN.test(trimmed)) {
    throw new GraphLensValidationError('Search term contains disallowed control characters.', 'term');
  }
  // Allow letters, numbers, spaces and a conservative punctuation set used
  // in real entity names/hostnames/domains. Everything else (quotes,
  // backslashes, pipes, asterisks, parentheses, etc) is stripped rather
  // than escaped, because this term is also used for local/client-side
  // filtering where "escaping" has no meaning.
  const cleaned = trimmed.replace(/[^A-Za-z0-9 ._:@-]/g, '');
  if (cleaned.length === 0) {
    throw new GraphLensValidationError('Search term contains no permitted characters.', 'term');
  }
  return { raw: trimmed, splSafe: escapeSplStringLiteral(cleaned) };
}

/** HTML-escape a value for the rare case it is rendered outside of React's default text escaping (e.g. exported HTML/SVG, window.title). */
export function escapeHtml(value) {
  const str = value === null || value === undefined ? '' : String(value);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitise a value before it is written into an exported CSV cell.
 * Strips control characters, caps length, and defangs formula injection
 * (Excel/Sheets treat a leading =, +, -, @, tab or CR as a formula) by
 * prefixing a single quote, per OWASP CSV injection guidance.
 */
export function sanitizeForExportCell(value, { maxLength = 4000 } = {}) {
  let str = value === null || value === undefined ? '' : String(value);
  str = str.replace(CONTROL_CHAR_PATTERN_GLOBAL, '').replace(/[\r\n]+/g, ' ').slice(0, maxLength);
  if (/^[=+\-@\t]/.test(str)) {
    str = `'${str}`;
  }
  return str;
}

/** Returns `value` if it is a safe, bare (unquoted-context-safe) index name, otherwise `fallback`. Never throws - callers use this for graceful degradation of a search token derived from event data rather than direct user input. */
export function safeIndexNameOrFallback(value, fallback = '*') {
  return typeof value === 'string' && INDEX_NAME_PATTERN.test(value) ? value : fallback;
}

/** Returns `value` if it is a safe, bare (unquoted-context-safe) sourcetype name, otherwise `fallback`. */
export function safeSourcetypeOrFallback(value, fallback = '*') {
  return typeof value === 'string' && SOURCETYPE_PATTERN.test(value) ? value : fallback;
}

/** Validate a Splunk relative or ISO-8601 time literal used for earliest/latest tokens. */
export function assertValidTimeLiteral(value, field = 'time') {
  if (!isNonEmptyString(value) || value.length > 64 || CONTROL_CHAR_PATTERN.test(value)) {
    throw new GraphLensValidationError(`Invalid ${field} value.`, field);
  }
  const RELATIVE = /^(now|-?\d+[smhdwMqy]@?[smhdwMqy]?)$/;
  const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
  const EPOCH = /^\d{1,15}(\.\d+)?$/;
  if (!RELATIVE.test(value) && !ISO.test(value) && !EPOCH.test(value)) {
    throw new GraphLensValidationError(`${field} is not a recognised Splunk time literal.`, field);
  }
  return value;
}
