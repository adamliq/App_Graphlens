import {
  buildInitialEntitySearchSpl,
  buildExpandNodeSpl,
  buildNodeDetailsSpl,
  buildEdgeDetailsSpl,
  buildEvidenceSpl,
  buildClusterExpandSpl,
} from '../../src/main/webapp/shared/services/splTemplates';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

describe('splTemplates - every search starts with the literal "search" keyword', () => {
  // Splunk's /services/search/jobs ad-hoc dispatch rejects a bare
  // macro/filter expression with no leading generating command
  // ("Unknown search command 'index'") - confirmed against a live Splunk
  // instance. Every template must start with "search ".
  test.each([
    ['initial entity search', buildInitialEntitySearchSpl('jsmith', 20)],
    ['expand node', buildExpandNodeSpl('user:jsmith', 100)],
    ['node details', buildNodeDetailsSpl('user:jsmith')],
    ['edge details', buildEdgeDetailsSpl('edge:abc123')],
    ['evidence', buildEvidenceSpl({
      safe_evidence_index: 'graphlens_relationships',
      safe_evidence_sourcetype: 'graphlens:relationship',
      safe_evidence_key_field: 'evidence_reference',
      safe_evidence_key_value: '"edge:abc123"',
    }, 100)],
    ['cluster expand', buildClusterExpandSpl('node_type', 'user', 100)],
  ])('%s starts with "search "', (_name, spl) => {
    expect(spl.startsWith('search ')).toBe(true);
  });
});

describe('splTemplates - identifier validation', () => {
  test('buildExpandNodeSpl rejects an invalid node id', () => {
    expect(() => buildExpandNodeSpl('user: jsmith" | delete', 100)).toThrow(GraphLensValidationError);
  });

  test('buildNodeDetailsSpl rejects an invalid node id', () => {
    expect(() => buildNodeDetailsSpl('../../etc/passwd')).toThrow(GraphLensValidationError);
  });

  test('buildEdgeDetailsSpl rejects an invalid edge id', () => {
    expect(() => buildEdgeDetailsSpl('edge:1`external_cmd`')).toThrow(GraphLensValidationError);
  });

  test('buildExpandNodeSpl embeds a server-side graphlens_id_pattern guard for the exact node id', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 50);
    expect(spl).toContain('| where match("user:jsmith", `graphlens_id_pattern`)');
  });
});

describe('splTemplates - limits are always bare, validated numbers', () => {
  test('buildExpandNodeSpl clamps an out-of-range limit', () => {
    const spl = buildExpandNodeSpl('user:jsmith', 999999);
    expect(spl).toContain('| head 5000'); // clamped to max
    expect(spl).not.toContain('999999');
  });

  test('buildInitialEntitySearchSpl falls back for a garbage limit rather than embedding it', () => {
    const spl = buildInitialEntitySearchSpl('jsmith', 'not-a-number; | delete');
    expect(spl).toContain('| head 20');
    expect(spl).not.toMatch(/delete/);
  });
});

describe('splTemplates - evidence search interpolates only pre-validated tokens', () => {
  test('builds the expected index/sourcetype/key clause', () => {
    const spl = buildEvidenceSpl({
      safe_evidence_index: 'graphlens_relationships',
      safe_evidence_sourcetype: 'graphlens:relationship',
      safe_evidence_key_field: 'src_user',
      safe_evidence_key_value: '"jsmith"',
    }, 50);
    expect(spl).toContain('index=graphlens_relationships sourcetype=graphlens:relationship src_user="jsmith"');
    expect(spl).toContain('| head 50');
  });
});
