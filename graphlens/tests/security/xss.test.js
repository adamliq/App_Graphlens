/**
 * XSS regression tests (design brief section 29.3). React escapes text
 * content by default, so the real risk surface is (a) values that get
 * turned into raw HTML/strings outside of React's rendering - exports,
 * error messages - and (b) the graph transformer, which is the one place
 * untrusted Splunk event data is converted into the objects every
 * component renders.
 */
import { escapeHtml } from '../../src/main/webapp/shared/utilities/splSafety';
import { transformRowsToGraph } from '../../src/main/webapp/shared/services/graphTransformer';
import { exportGraphAsJson } from '../../src/main/webapp/shared/services/exportService';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  "javascript:alert(1)",
  '<a href="javascript:alert(1)">click</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<body onload=alert(1)>',
  '${alert(1)}',
  '{{constructor.constructor("alert(1)")()}}',
  '<svg/onload=alert(1)>',
  '<script>alert(1)</script>',
];

describe('escapeHtml neutralises every known XSS payload', () => {
  test.each(XSS_PAYLOADS)('payload: %j', (payload) => {
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script');
    expect(escaped).not.toMatch(/<[a-z]/i);
  });
});

describe('graphTransformer escapes node/edge labels and descriptions before they ever reach the graph state', () => {
  test.each(XSS_PAYLOADS)('malicious node_label: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: payload }], []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.label).not.toMatch(/<[a-z]/i);
  });

  test.each(XSS_PAYLOADS)('malicious relationship_label: %j', (payload) => {
    const { edges } = transformRowsToGraph([], [{
      source_id: 'user:jsmith',
      target_id: 'host:server01',
      relationship_type: 'AUTHENTICATED_TO',
      relationship_label: payload,
    }]);
    expect(edges).toHaveLength(1);
    expect(edges[0].data.relationshipLabel).not.toMatch(/<[a-z]/i);
  });

  test.each(XSS_PAYLOADS)('malicious node description: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: 'ok', description: payload }], []);
    expect(nodes[0].data.description).not.toMatch(/<[a-z]/i);
  });
});

describe('exported content never carries raw markup from a malicious label', () => {
  test('a script-tag label is already HTML-escaped by the time it reaches export, because it went through the transformer first (the real data path - search results always pass through transformRowsToGraph before they can end up in graph state)', () => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: '<script>alert(1)</script>' }], []);
    const state = { visibleNodes: { [nodes[0].data.id]: nodes[0].data }, visibleEdges: {}, activeFilters: {} };
    const json = exportGraphAsJson(state);
    expect(json).not.toContain('<script>alert(1)</script>');
    expect(json).toContain('&lt;script&gt;');
  });
});
