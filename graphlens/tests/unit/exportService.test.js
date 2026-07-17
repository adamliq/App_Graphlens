import { createEmptyGraphState } from '../../src/main/webapp/shared/models/graphModel';
import { exportGraphAsJson, exportNodesAsCsv, exportEdgesAsCsv, buildExportBlob } from '../../src/main/webapp/shared/services/exportService';

function stateWithOneEdge() {
  const state = createEmptyGraphState();
  state.visibleNodes['user:jsmith'] = { id: 'user:jsmith', label: 'J Smith', type: 'user', riskScore: 40, eventCount: 3 };
  state.visibleNodes['host:server01'] = { id: 'host:server01', label: '=cmd|calc', type: 'host', riskScore: 20, eventCount: 3 };
  state.visibleEdges['edge:1'] = {
    id: 'edge:1', source: 'user:jsmith', target: 'host:server01', relationship: 'AUTHENTICATED_TO',
    relationshipLabel: 'Authenticated to', directed: true, eventCount: 3, riskScore: 40,
  };
  return state;
}

test('exportGraphAsJson includes metadata and all visible nodes/edges', () => {
  const json = JSON.parse(exportGraphAsJson(stateWithOneEdge(), { appVersion: '1.0.0' }));
  expect(json.metadata.appVersion).toBe('1.0.0');
  expect(json.nodes).toHaveLength(2);
  expect(json.edges).toHaveLength(1);
});

test('CSV export defangs formula-injection-looking labels', () => {
  const csv = exportNodesAsCsv(stateWithOneEdge());
  expect(csv).toContain("'=cmd|calc");
});

test('CSV export quotes cells containing commas or quotes', () => {
  const state = stateWithOneEdge();
  state.visibleNodes['user:jsmith'].label = 'Smith, John "Jack"';
  const csv = exportNodesAsCsv(state);
  expect(csv).toContain('"Smith, John ""Jack"""');
});

test('exportEdgesAsCsv contains the expected header', () => {
  const csv = exportEdgesAsCsv(stateWithOneEdge());
  expect(csv.split('\r\n')[0]).toBe('id,source,target,relationship,relationshipLabel,directed,eventCount,riskScore,firstSeen,lastSeen');
});

test('buildExportBlob rejects an unsupported format', () => {
  expect(() => buildExportBlob('exe', stateWithOneEdge())).toThrow();
});

test('buildExportBlob produces a Blob for each supported format', () => {
  const state = stateWithOneEdge();
  expect(buildExportBlob('json', state)).toBeInstanceOf(Blob);
  expect(buildExportBlob('csv-nodes', state)).toBeInstanceOf(Blob);
  expect(buildExportBlob('csv-edges', state)).toBeInstanceOf(Blob);
});
