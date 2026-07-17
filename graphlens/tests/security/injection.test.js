/**
 * Consolidated SPL/command-injection regression tests (design brief
 * section 29.3). These exercise the same validation/escaping functions as
 * the unit tests, but as a single payload-driven suite so the injection
 * coverage is easy to audit and extend in one place, independent of which
 * component happens to call each function.
 */
import { assertValidId, isValidId, sanitizeSearchTerm, escapeSplStringLiteral, GraphLensValidationError, safeIndexNameOrFallback } from '../../src/main/webapp/shared/utilities/splSafety';
import { transformRowsToGraph } from '../../src/main/webapp/shared/services/graphTransformer';
import { buildEvidenceTokensForNode } from '../../src/main/webapp/shared/services/evidenceQueryBuilder';

const INJECTION_PAYLOADS = [
  'user:jsmith" | delete',
  'user:jsmith" OR 1=1 | delete',
  'user:jsmith`|noop|`',
  'user:jsmith\\" | outputlookup malicious.csv',
  'user:jsmith\n| delete',
  'user:jsmith\r\n| delete',
  '*:*',
  'user:jsmith*',
  '| eval x=1',
  'user:jsmith; rm -rf /',
  'user:jsmith$SPL_INJECT$',
  'user:jsmith`external_search_command`',
  String.fromCharCode(0) + 'user:jsmith',
  'a'.repeat(10000),
];

describe('node/edge identifiers reject every known SPL injection payload', () => {
  test.each(INJECTION_PAYLOADS)('rejects payload: %j', (payload) => {
    expect(isValidId(payload)).toBe(false);
    expect(() => assertValidId(payload)).toThrow(GraphLensValidationError);
  });
});

describe('graphTransformer refuses to build graph elements from injection payloads', () => {
  test.each(INJECTION_PAYLOADS)('drops edge rows carrying payload as source_id: %j', (payload) => {
    const { edges, diagnostics } = transformRowsToGraph([], [{
      source_id: payload,
      target_id: 'host:server01',
      relationship_type: 'AUTHENTICATED_TO',
    }]);
    expect(edges).toHaveLength(0);
    expect(diagnostics.rejectedRows).toBe(1);
  });
});

describe('free-text search term never carries SPL metacharacters through to the SPL-safe value', () => {
  test.each(INJECTION_PAYLOADS)('neutralises payload: %j', (payload) => {
    let result;
    try {
      result = sanitizeSearchTerm(payload);
    } catch (err) {
      expect(err).toBeInstanceOf(GraphLensValidationError);
      return;
    }
    expect(result.splSafe).not.toMatch(/["`|]/);
    expect(result.splSafe).not.toMatch(/[\r\n]/);
  });
});

describe('evidence query builder rejects an injection payload disguised as a node label', () => {
  test.each(INJECTION_PAYLOADS)('payload: %j', (payload) => {
    let tokens;
    try {
      tokens = buildEvidenceTokensForNode({ type: 'user', label: payload });
    } catch (err) {
      expect(err).toBeInstanceOf(GraphLensValidationError);
      return;
    }
    // safe_evidence_key_value is deliberately wrapped in one pair of
    // literal double quotes (it is substituted as a quoted SPL string
    // literal) - what must never happen is a *third* quote, a backtick or
    // a pipe surviving inside that wrapper, which would let the payload
    // break out of the literal or inject a pipe/subsearch.
    const value = tokens.safe_evidence_key_value;
    expect(value.startsWith('"')).toBe(true);
    expect(value.endsWith('"')).toBe(true);
    const inner = value.slice(1, -1);
    expect(inner).not.toMatch(/["`|]/);
  });
});

describe('escapeSplStringLiteral cannot be tricked into producing an unescaped quote', () => {
  test('every backslash is doubled and every quote is escaped, for any mix of the two', () => {
    const samples = ['a\\b', 'a"b', 'a\\"b', 'a\\\\b', 'a"""b', 'a\\\\\\b"""'];
    samples.forEach((raw) => {
      const escaped = escapeSplStringLiteral(raw);
      // Reversing the escaping (in the same order it was applied, in
      // reverse) must reproduce the original input exactly - proving no
      // quote can "escape" the literal early and no backslash can absorb
      // the literal's closing quote.
      const unescaped = escaped.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      expect(unescaped).toBe(raw);
      // Wrapped in quotes, an odd/unbalanced sequence of quote characters
      // must never appear un-escaped.
      const wrapped = `"${escaped}"`;
      const strippedEscapes = wrapped.replace(/\\./g, '_');
      const quoteCount = (strippedEscapes.match(/"/g) || []).length;
      expect(quoteCount).toBe(2); // only the two literal-delimiting quotes remain
    });
  });
});

describe('index/sourcetype tokens used unquoted in SPL fall back rather than admit metacharacters', () => {
  test.each(INJECTION_PAYLOADS)('payload as index name: %j', (payload) => {
    expect(safeIndexNameOrFallback(payload, 'safe_default')).toBe('safe_default');
  });
});
