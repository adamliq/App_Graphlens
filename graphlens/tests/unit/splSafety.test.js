import {
  assertValidId,
  isValidId,
  assertValidTypeToken,
  assertAllowlisted,
  clampInteger,
  escapeSplStringLiteral,
  sanitizeSearchTerm,
  escapeHtml,
  sanitizeForExportCell,
  assertValidTimeLiteral,
  safeIndexNameOrFallback,
  safeSourcetypeOrFallback,
  GraphLensValidationError,
} from '../../src/main/webapp/shared/utilities/splSafety';

describe('assertValidId / isValidId', () => {
  test.each([
    'user:jsmith',
    'host:server01.example.com',
    'ip:192.0.2.10',
    'process:sha256:abc123',
    'sourcetype:XmlWinEventLog:Security',
    'application/finance_system',
    'a',
  ])('accepts well-formed id %s', (id) => {
    expect(isValidId(id)).toBe(true);
  });

  test.each([
    ['empty string', ''],
    ['leading colon', ':user:jsmith'],
    ['embedded quote', 'user:js"mith'],
    ['embedded pipe', 'user:jsmith|delete'],
    ['embedded backslash', 'user:js\\mith'],
    ['embedded space', 'user: jsmith'],
    ['embedded newline', 'user:jsmith\nboo'],
    ['embedded CR', 'user:jsmith\rboo'],
    ['embedded NUL', `user:jsmith${String.fromCharCode(0)}boo`],
    ['wildcard', 'user:*'],
    ['too long', `user:${'a'.repeat(300)}`],
    ['non-string', 42],
    ['null', null],
    ['undefined', undefined],
  ])('rejects %s', (_label, id) => {
    expect(isValidId(id)).toBe(false);
    expect(() => assertValidId(id)).toThrow(GraphLensValidationError);
  });
});

describe('assertValidTypeToken', () => {
  test('accepts a normal type token', () => {
    expect(() => assertValidTypeToken('AUTHENTICATED_TO')).not.toThrow();
  });

  test.each(['', '1abc', 'has space', 'semi;colon', 'a'.repeat(65)])('rejects %s', (token) => {
    expect(() => assertValidTypeToken(token)).toThrow(GraphLensValidationError);
  });
});

describe('assertAllowlisted', () => {
  test('accepts a listed value', () => {
    expect(assertAllowlisted('cose', ['cose', 'grid'])).toBe('cose');
  });

  test('rejects an unlisted value', () => {
    expect(() => assertAllowlisted('evil; | delete', ['cose', 'grid'])).toThrow(GraphLensValidationError);
  });
});

describe('clampInteger', () => {
  test('clamps within range', () => {
    expect(clampInteger(50, { min: 1, max: 10, fallback: 1 })).toBe(10);
    expect(clampInteger(-5, { min: 1, max: 10, fallback: 1 })).toBe(1);
    expect(clampInteger(5, { min: 1, max: 10, fallback: 1 })).toBe(5);
  });

  test('falls back for non-numeric input', () => {
    expect(clampInteger('not a number', { min: 1, max: 10, fallback: 3 })).toBe(3);
    expect(clampInteger(undefined, { min: 1, max: 10, fallback: 3 })).toBe(3);
    expect(clampInteger(NaN, { min: 1, max: 10, fallback: 3 })).toBe(3);
    expect(clampInteger(3.5, { min: 1, max: 10, fallback: 3 })).toBe(3);
  });

  test('a numeric-with-trailing-garbage string is safe because only the coerced number is ever used downstream', () => {
    // parseInt("5; | delete") === 5. This is safe: clampInteger returns a
    // plain JS number, never the original string, so the trailing
    // metacharacters can never reach SPL - only the digit "5" can.
    expect(clampInteger('5; | delete', { min: 1, max: 10, fallback: 3 })).toBe(5);
  });
});

describe('escapeSplStringLiteral', () => {
  test('escapes backslashes and quotes', () => {
    expect(escapeSplStringLiteral('a\\b"c')).toBe('a\\\\b\\"c');
  });

  test('rejects control characters', () => {
    expect(() => escapeSplStringLiteral('a\nb')).toThrow(GraphLensValidationError);
    expect(() => escapeSplStringLiteral(`a${String.fromCharCode(0)}b`)).toThrow(GraphLensValidationError);
  });

  test('rejects empty input', () => {
    expect(() => escapeSplStringLiteral('')).toThrow(GraphLensValidationError);
  });
});

describe('sanitizeSearchTerm', () => {
  test('strips SPL metacharacters and produces an SPL-safe literal', () => {
    const result = sanitizeSearchTerm('jsmith" | delete');
    expect(result.splSafe).not.toMatch(/["|]/);
  });

  test('truncates to maxLength', () => {
    const result = sanitizeSearchTerm('a'.repeat(500), { maxLength: 10 });
    expect(result.raw.length).toBeLessThanOrEqual(10);
  });

  test('rejects a term that becomes empty after cleaning', () => {
    expect(() => sanitizeSearchTerm('|||***')).toThrow(GraphLensValidationError);
  });

  test('rejects newline injection', () => {
    expect(() => sanitizeSearchTerm('jsmith\n| delete')).toThrow(GraphLensValidationError);
  });
});

describe('escapeHtml', () => {
  test('escapes script tags', () => {
    expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('escapes quotes used to break out of attributes', () => {
    expect(escapeHtml('"><img src=x onerror=alert(1)>')).not.toContain('<img');
  });

  test('handles null/undefined gracefully', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('sanitizeForExportCell', () => {
  test.each(['=cmd', '+cmd', '-cmd', '@cmd'])('defangs formula injection starting with %s', (value) => {
    const result = sanitizeForExportCell(value);
    expect(result.startsWith("'")).toBe(true);
  });

  test('a leading tab is stripped as a control character, leaving nothing dangerous behind', () => {
    expect(sanitizeForExportCell('\tcmd')).toBe('cmd');
  });

  test('a tab hiding a dangerous character in front is still defanged once the tab is stripped', () => {
    expect(sanitizeForExportCell('\t=cmd').startsWith("'")).toBe(true);
  });

  test('strips control characters and collapses newlines', () => {
    const result = sanitizeForExportCell(`a b${String.fromCharCode(0)}c\rd`);
    expect(result).not.toMatch(/[\r\n]/);
  });

  test('truncates to maxLength', () => {
    expect(sanitizeForExportCell('a'.repeat(100), { maxLength: 10 }).length).toBeLessThanOrEqual(10);
  });
});

describe('assertValidTimeLiteral', () => {
  test.each(['-24h', '-7d', 'now', '0', '1700000000', '2026-07-17T08:00:00Z'])('accepts %s', (value) => {
    expect(() => assertValidTimeLiteral(value)).not.toThrow();
  });

  test.each(['; | delete', 'DROP TABLE', '-24h; rm -rf /', ''])('rejects %s', (value) => {
    expect(() => assertValidTimeLiteral(value)).toThrow(GraphLensValidationError);
  });
});

describe('safeIndexNameOrFallback / safeSourcetypeOrFallback', () => {
  test('accepts normal index/sourcetype names', () => {
    expect(safeIndexNameOrFallback('graphlens_relationships')).toBe('graphlens_relationships');
    expect(safeSourcetypeOrFallback('XmlWinEventLog:Security')).toBe('XmlWinEventLog:Security');
  });

  test('falls back for an index name carrying SPL metacharacters', () => {
    expect(safeIndexNameOrFallback('main | delete', '*')).toBe('*');
    expect(safeIndexNameOrFallback('main"; | delete', '*')).toBe('*');
  });

  test('falls back for a non-string value', () => {
    expect(safeIndexNameOrFallback(undefined, 'fallback_index')).toBe('fallback_index');
  });
});

describe('unicode and encoded-payload edge cases', () => {
  test('rejects ids with unicode homoglyph/RTL override characters', () => {
    expect(isValidId('user:jsmith‮gnp.exe')).toBe(false);
  });

  test('rejects URL-encoded traversal-looking values (not decoded, but must still fail the grammar)', () => {
    expect(isValidId('../../etc/passwd')).toBe(false);
    expect(isValidId('user:..%2f..%2fetc%2fpasswd')).toBe(false);
  });

  test('sanitizeSearchTerm strips emoji/unicode but does not crash', () => {
    const result = sanitizeSearchTerm('jsmith \u{1F600} test');
    expect(typeof result.splSafe).toBe('string');
  });
});
