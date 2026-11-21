import { createEmptyGraphState } from '../../src/main/webapp/shared/models/graphModel';
import { exportGraphAsJson } from '../../src/main/webapp/shared/services/exportService';
import { parseImportedGraphJson } from '../../src/main/webapp/shared/services/importService';
import { transformRowsToGraph } from '../../src/main/webapp/shared/services/graphTransformer';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

function stateWithOneEdge() {
  const state = createEmptyGraphState();
  state.visibleNodes['user:jsmith'] = { id: 'user:jsmith', label: 'J Smith', type: 'user', riskScore: 40, eventCount: 3 };
  state.visibleNodes['host:server01'] = { id: 'host:server01', label: 'server01', type: 'host', riskScore: 20, eventCount: 3 };
  state.visibleEdges['edge:1'] = {
    id: 'edge:1', source: 'user:jsmith', target: 'host:server01', relationship: 'AUTHENTICATED_TO',
    relationshipLabel: 'Authenticated to', directed: true, eventCount: 3, riskScore: 40,
  };
  return state;
}

describe('parseImportedGraphJson - round trip with exportGraphAsJson', () => {
  test('a freshly exported graph parses back into the same nodes/edges via transformRowsToGraph', () => {
    const json = exportGraphAsJson(stateWithOneEdge(), { appVersion: '1.4.0' });
    const { nodeRows, edgeRows, metadata } = parseImportedGraphJson(json);
    expect(metadata.appVersion).toBe('1.4.0');

    const { nodes, edges } = transformRowsToGraph(nodeRows, edgeRows);
    const nodeIds = nodes.map((n) => n.data.id).sort();
    expect(nodeIds).toEqual(['host:server01', 'user:jsmith']);
    expect(edges).toHaveLength(1);
    expect(edges[0].data.relationship).toBe('AUTHENTICATED_TO');
  });
});

describe('parseImportedGraphJson - rejects malformed input', () => {
  test('throws GraphLensValidationError for text that is not valid JSON', () => {
    expect(() => parseImportedGraphJson('not json {')).toThrow(GraphLensValidationError);
  });

  test('throws GraphLensValidationError for valid JSON that is not an object', () => {
    expect(() => parseImportedGraphJson('[1, 2, 3]')).toThrow(GraphLensValidationError);
    expect(() => parseImportedGraphJson('"just a string"')).toThrow(GraphLensValidationError);
  });

  test('throws GraphLensValidationError when nodes/edges arrays are missing', () => {
    expect(() => parseImportedGraphJson('{}')).toThrow(GraphLensValidationError);
    expect(() => parseImportedGraphJson('{"nodes": []}')).toThrow(GraphLensValidationError);
    expect(() => parseImportedGraphJson('{"nodes": "oops", "edges": []}')).toThrow(GraphLensValidationError);
  });

  test('tolerates garbage entries inside otherwise-valid nodes/edges arrays without throwing', () => {
    const { nodeRows, edgeRows } = parseImportedGraphJson('{"nodes": [null, 42, {"id": "x"}], "edges": ["oops"]}');
    expect(nodeRows).toHaveLength(1);
    expect(edgeRows).toHaveLength(0);
  });

  test('a malicious/invalid id inside an otherwise well-shaped import is rejected downstream by transformRowsToGraph', () => {
    const json = JSON.stringify({
      nodes: [{ id: 'bad id with spaces | delete', type: 'user', label: 'x' }],
      edges: [],
    });
    const { nodeRows, edgeRows } = parseImportedGraphJson(json);
    const { nodes, diagnostics } = transformRowsToGraph(nodeRows, edgeRows);
    expect(nodes).toHaveLength(0);
    expect(diagnostics.rejectedRows).toBe(1);
  });

  test('metadata is omitted (not just copied blindly) when not a plain object', () => {
    const { metadata } = parseImportedGraphJson('{"nodes": [], "edges": [], "metadata": "nope"}');
    expect(metadata).toBeNull();
  });
});
