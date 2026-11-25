import { transformRowsToGraph, deriveEdgeId, sanitizeNodeEdit, sanitizeEdgeEdit } from '../../src/main/webapp/shared/services/graphTransformer';

function edgeRow(overrides = {}) {
  return {
    edge_id: 'edge:1',
    source_id: 'user:jsmith',
    source_type: 'user',
    source_label: 'J Smith',
    target_id: 'host:server01',
    target_type: 'host',
    target_label: 'server01',
    relationship_type: 'AUTHENTICATED_TO',
    relationship_label: 'Authenticated to',
    event_count: 5,
    risk_score: 40,
    first_seen: '2026-07-15T00:00:00Z',
    last_seen: '2026-07-17T00:00:00Z',
    source_index: 'graphlens_relationships',
    source_sourcetype: 'graphlens:relationship',
    evidence_reference: 'edge:1',
    ...overrides,
  };
}

describe('transformRowsToGraph - node/edge creation', () => {
  test('creates both endpoint nodes from a single edge row', () => {
    const { nodes, edges, diagnostics } = transformRowsToGraph([], [edgeRow()]);
    expect(nodes).toHaveLength(2);
    expect(edges).toHaveLength(1);
    expect(diagnostics.rejectedRows).toBe(0);
    const nodeIds = nodes.map((n) => n.data.id).sort();
    expect(nodeIds).toEqual(['host:server01', 'user:jsmith']);
  });

  test('derives a deterministic edge id when edge_id is missing', () => {
    const row = edgeRow({ edge_id: undefined });
    const { edges } = transformRowsToGraph([], [row]);
    expect(edges[0].data.id).toBe(deriveEdgeId('user:jsmith', 'host:server01', 'AUTHENTICATED_TO'));
  });
});

describe('transformRowsToGraph - deduplication', () => {
  test('merges duplicate edges by id, summing event counts and keeping max risk', () => {
    const rowA = edgeRow({ event_count: 5, risk_score: 40, first_seen: '2026-07-15T00:00:00Z', last_seen: '2026-07-16T00:00:00Z' });
    const rowB = edgeRow({ event_count: 3, risk_score: 70, first_seen: '2026-07-10T00:00:00Z', last_seen: '2026-07-17T00:00:00Z' });
    const { edges, diagnostics } = transformRowsToGraph([], [rowA, rowB]);
    expect(edges).toHaveLength(1);
    expect(diagnostics.duplicateEdges).toBe(1);
    expect(edges[0].data.eventCount).toBe(8);
    expect(edges[0].data.riskScore).toBe(70);
    expect(edges[0].data.firstSeen).toBe('2026-07-10T00:00:00Z');
    expect(edges[0].data.lastSeen).toBe('2026-07-17T00:00:00Z');
  });

  test('merges duplicate nodes discovered via multiple edges', () => {
    const rowA = edgeRow({ edge_id: 'edge:1', target_id: 'host:server01', event_count: 2 });
    const rowB = edgeRow({ edge_id: 'edge:2', target_id: 'host:server02', event_count: 2 });
    const { nodes, diagnostics } = transformRowsToGraph([], [rowA, rowB]);
    // user:jsmith appears as source in both rows -> should be a single node.
    const jsmithNodes = nodes.filter((n) => n.data.id === 'user:jsmith');
    expect(jsmithNodes).toHaveLength(1);
    expect(diagnostics.duplicateNodes).toBeGreaterThanOrEqual(1);
  });
});

describe('transformRowsToGraph - validation and rejection', () => {
  test('rejects rows with an invalid source_id/target_id', () => {
    const badRow = edgeRow({ source_id: 'user: js"mith | delete' });
    const { edges, diagnostics } = transformRowsToGraph([], [badRow]);
    expect(edges).toHaveLength(0);
    expect(diagnostics.rejectedRows).toBe(1);
  });

  test('rejects a null/non-object row without throwing', () => {
    expect(() => transformRowsToGraph([], [null, undefined, 'not an object'])).not.toThrow();
    const { diagnostics } = transformRowsToGraph([], [null, undefined, 'not an object']);
    expect(diagnostics.rejectedRows).toBe(3);
  });

  test('escapes HTML in labels so raw markup never reaches Cytoscape data', () => {
    const row = edgeRow({ source_label: '<img src=x onerror=alert(1)>' });
    const { nodes } = transformRowsToGraph([], [row]);
    const sourceNode = nodes.find((n) => n.data.id === 'user:jsmith');
    expect(sourceNode.data.label).not.toContain('<img');
    expect(sourceNode.data.label).toContain('&lt;img');
  });

  test('clamps out-of-range risk scores into 0-100', () => {
    const row = edgeRow({ risk_score: 999 });
    const { edges } = transformRowsToGraph([], [row]);
    expect(edges[0].data.riskScore).toBe(100);
  });

  test('treats a negative/garbage risk score as 0', () => {
    const row = edgeRow({ risk_score: 'not-a-number' });
    const { edges } = transformRowsToGraph([], [row]);
    expect(edges[0].data.riskScore).toBe(0);
  });
});

describe('transformRowsToGraph - limits', () => {
  test('stops adding nodes once maxNodes is reached and reports limitReached', () => {
    const rows = Array.from({ length: 10 }, (_, i) => edgeRow({
      edge_id: `edge:${i}`,
      source_id: `user:u${i}`,
      target_id: `host:h${i}`,
    }));
    const { nodes, diagnostics } = transformRowsToGraph([], rows, { maxNodes: 5, maxEdges: 100 });
    expect(nodes.length).toBeLessThanOrEqual(5);
    expect(diagnostics.limitReached).toBe(true);
  });

  test('stops adding edges once maxEdges is reached', () => {
    const rows = Array.from({ length: 10 }, (_, i) => edgeRow({
      edge_id: `edge:${i}`,
      source_id: `user:u${i}`,
      target_id: `host:h${i}`,
    }));
    const { edges, diagnostics } = transformRowsToGraph([], rows, { maxNodes: 1000, maxEdges: 3 });
    expect(edges.length).toBeLessThanOrEqual(3);
    expect(diagnostics.limitReached).toBe(true);
  });
});

function sampleNode(overrides = {}) {
  const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: 'J Smith', risk_score: 10, event_count: 1 }], []);
  return { ...nodes[0].data, ...overrides };
}

function sampleEdge(overrides = {}) {
  const { edges } = transformRowsToGraph([], [edgeRow()]);
  return { ...edges[0].data, ...overrides };
}

describe('sanitizeNodeEdit - edit mode (1.19.0, graphlens_edit_graph_data)', () => {
  test('replaces editable fields from the patch, leaving id untouched', () => {
    const existing = sampleNode();
    const next = sanitizeNodeEdit(existing, {
      label: 'New Label', type: 'host', group: 'g1', description: 'desc', riskScore: 77, eventCount: 9, sourceIndex: 'idx', sourceSourcetype: 'st',
    });
    expect(next.id).toBe(existing.id);
    expect(next.label).toBe('New Label');
    expect(next.type).toBe('host');
    expect(next.group).toBe('g1');
    expect(next.description).toBe('desc');
    expect(next.riskScore).toBe(77);
    expect(next.eventCount).toBe(9);
    expect(next.sourceIndex).toBe('idx');
    expect(next.sourceSourcetype).toBe('st');
  });

  test('clamps an out-of-range risk score the same way a fresh row would be', () => {
    const existing = sampleNode();
    const next = sanitizeNodeEdit(existing, { label: 'x', riskScore: 9999, eventCount: -5 });
    expect(next.riskScore).toBe(100);
    expect(next.eventCount).toBe(0);
  });

  test('HTML-escapes an edited label the same way a fresh row would be (XSS-safe)', () => {
    const existing = sampleNode();
    const next = sanitizeNodeEdit(existing, { label: '<script>alert(1)</script>', riskScore: 0, eventCount: 0 });
    expect(next.label).not.toMatch(/<[a-z]/i);
  });

  test('recomputes color/shape/icon from the new type via nodeTypeConfig', () => {
    const existing = sampleNode();
    const nodeTypeConfig = { host: { color: '#abc123', shape: 'square', icon: 'Server' } };
    const next = sanitizeNodeEdit(existing, { label: 'x', type: 'host', riskScore: 0, eventCount: 0 }, nodeTypeConfig);
    expect(next.color).toBe('#abc123');
    expect(next.shape).toBe('square');
    expect(next.icon).toBe('Server');
  });

  test('falls back to the existing label when the patch label is blank', () => {
    const existing = sampleNode({ label: 'Original' });
    const next = sanitizeNodeEdit(existing, { label: '', riskScore: 0, eventCount: 0 });
    expect(next.label).toBe(existing.id);
  });
});

describe('sanitizeEdgeEdit - edit mode (1.19.0, graphlens_edit_graph_data)', () => {
  test('replaces editable fields from the patch, leaving id/source/target untouched', () => {
    const existing = sampleEdge();
    const next = sanitizeEdgeEdit(existing, {
      relationship: 'CONNECTED_TO', relationshipLabel: 'Connected to', directed: false, riskScore: 55, eventCount: 3,
    });
    expect(next.id).toBe(existing.id);
    expect(next.source).toBe(existing.source);
    expect(next.target).toBe(existing.target);
    expect(next.relationship).toBe('CONNECTED_TO');
    expect(next.relationshipLabel).toBe('Connected to');
    expect(next.directed).toBe(false);
    expect(next.riskScore).toBe(55);
    expect(next.eventCount).toBe(3);
  });

  test('HTML-escapes an edited relationship label the same way a fresh row would be (XSS-safe)', () => {
    const existing = sampleEdge();
    const next = sanitizeEdgeEdit(existing, { relationshipLabel: '<img src=x onerror=alert(1)>', riskScore: 0, eventCount: 0 });
    expect(next.relationshipLabel).not.toMatch(/<[a-z]/i);
  });

  test('clamps an out-of-range risk score the same way a fresh row would be', () => {
    const existing = sampleEdge();
    const next = sanitizeEdgeEdit(existing, { riskScore: -50, eventCount: 0 });
    expect(next.riskScore).toBe(0);
  });
});
