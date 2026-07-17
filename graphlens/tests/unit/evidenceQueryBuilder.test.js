import { buildEvidenceTokensForEdge, buildEvidenceTokensForNode } from '../../src/main/webapp/shared/services/evidenceQueryBuilder';

describe('buildEvidenceTokensForEdge', () => {
  test('returns null when the edge has no evidence_reference', () => {
    expect(buildEvidenceTokensForEdge({ evidenceReference: undefined })).toBeNull();
  });

  test('builds a quoted, escaped key value and validates the reference id', () => {
    const tokens = buildEvidenceTokensForEdge({
      evidenceReference: 'edge:abc123',
      sourceIndex: 'graphlens_relationships',
      sourceSourcetype: 'graphlens:relationship',
    });
    expect(tokens.safe_evidence_key_field).toBe('evidence_reference');
    expect(tokens.safe_evidence_key_value).toBe('"edge:abc123"');
    expect(tokens.safe_evidence_index).toBe('graphlens_relationships');
  });

  test('throws for a malicious evidence reference', () => {
    expect(() => buildEvidenceTokensForEdge({ evidenceReference: 'a" | delete' })).toThrow();
  });

  test('falls back to the default index/sourcetype when the edge value is unsafe', () => {
    const tokens = buildEvidenceTokensForEdge({
      evidenceReference: 'edge:abc123',
      sourceIndex: 'main | delete',
      sourceSourcetype: undefined,
    }, { evidenceDefaultIndex: 'fallback_index' });
    expect(tokens.safe_evidence_index).toBe('fallback_index');
    expect(tokens.safe_evidence_sourcetype).toBe('*');
  });
});

describe('buildEvidenceTokensForNode', () => {
  test('maps a known node type to its heuristic key field', () => {
    const tokens = buildEvidenceTokensForNode({ type: 'user', label: 'jsmith', sourceIndex: 'idx', sourceSourcetype: 'st' });
    expect(tokens.safe_evidence_key_field).toBe('src_user');
    expect(tokens.safe_evidence_key_value).toBe('"jsmith"');
  });

  test('falls back to a generic key field for an unknown node type', () => {
    const tokens = buildEvidenceTokensForNode({ type: 'business_service', label: 'Online Banking' });
    expect(tokens.safe_evidence_key_field).toBe('value');
  });

  test('strips unsafe characters out of the node label before quoting', () => {
    const tokens = buildEvidenceTokensForNode({ type: 'user', label: 'jsmith" | delete' });
    expect(tokens.safe_evidence_key_value).not.toMatch(/[|]/);
  });

  test('throws when the label has nothing safe left after cleaning', () => {
    expect(() => buildEvidenceTokensForNode({ type: 'user', label: '|||***' })).toThrow();
  });
});
