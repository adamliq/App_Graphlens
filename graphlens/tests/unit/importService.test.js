import fs from 'fs';
import path from 'path';
import { createEmptyGraphState } from '../../src/main/webapp/shared/models/graphModel';
import { exportGraphAsJson } from '../../src/main/webapp/shared/services/exportService';
import { parseImportedGraphJson, parseImportedGraphCsv, parseCsvRowObjects } from '../../src/main/webapp/shared/services/importService';
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

describe('parseImportedGraphJson - pre-1.22 exports stored labels HTML-escaped; they are decoded on import', () => {
  function exportFile(appVersion, label, relationshipLabel) {
    const metadata = appVersion === undefined ? undefined : { appVersion };
    return JSON.stringify({
      metadata,
      nodes: [{ id: 'org:att', type: 'org', label }, { id: 'host:h1', type: 'host', label: 'h1' }],
      edges: [{ id: 'e1', source: 'org:att', target: 'host:h1', relationship: 'OWNS', relationshipLabel }],
    });
  }

  test('an export from 1.21.0 has its entities decoded', () => {
    const { nodeRows, edgeRows } = parseImportedGraphJson(exportFile('1.21.0', 'AT&amp;T &lt;Mobility&gt;', 'R&amp;D &quot;owns&quot; &#39;it&#39;'));
    expect(nodeRows[0].node_label).toBe('AT&T <Mobility>');
    expect(edgeRows[0].relationship_label).toBe('R&D "owns" \'it\'');
  });

  test('a doubly-escaped literal entity decodes one level only ("&amp;lt;" -> "&lt;", not "<")', () => {
    const { nodeRows } = parseImportedGraphJson(exportFile('1.4.0', 'use &amp;lt; here', 'x'));
    expect(nodeRows[0].node_label).toBe('use &lt; here');
  });

  test.each(['1.22.0', '1.23.4', '2.0.0'])('an export from %s is left exactly as written', (version) => {
    const { nodeRows } = parseImportedGraphJson(exportFile(version, 'AT&amp;T', 'x'));
    expect(nodeRows[0].node_label).toBe('AT&amp;T');
  });

  test.each([undefined, 'not-a-version', ''])('a file with appVersion %j (hand-made) is left exactly as written', (version) => {
    const { nodeRows } = parseImportedGraphJson(exportFile(version, 'AT&amp;T', 'x'));
    expect(nodeRows[0].node_label).toBe('AT&amp;T');
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

describe('parseImportedGraphCsv', () => {
  test('parses a simple edge-row CSV into edgeRows via the relationship schema', () => {
    const csv = 'source_id,source_type,source_label,target_id,target_type,target_label,relationship_type\n'
      + 'user:jsmith,user,J Smith,host:server01,host,server01,AUTHENTICATED_TO\n';
    const { nodeRows, edgeRows } = parseImportedGraphCsv(csv);
    expect(nodeRows).toHaveLength(0);
    expect(edgeRows).toHaveLength(1);
    expect(edgeRows[0].source_id).toBe('user:jsmith');
    expect(edgeRows[0].relationship_type).toBe('AUTHENTICATED_TO');
  });

  test('parses a node-row CSV into nodeRows', () => {
    const csv = 'node_id,node_type,node_label\nuser:jsmith,user,J Smith\n';
    const { nodeRows, edgeRows } = parseImportedGraphCsv(csv);
    expect(nodeRows).toHaveLength(1);
    expect(edgeRows).toHaveLength(0);
  });

  test('handles quoted fields with embedded commas, same as the bundled sample data', () => {
    const csv = 'source_id,source_type,source_label,target_id,target_type,target_label,relationship_type\n'
      + 'ldap_group:cn-finance-ops-ou-groups,ldap_group,"cn=finance-ops,ou=groups,dc=example,dc=com",'
      + 'identity_provider:corp_ldap,identity_provider,Corporate LDAP,AUTHENTICATES_VIA\n';
    const { edgeRows } = parseImportedGraphCsv(csv);
    expect(edgeRows).toHaveLength(1);
    expect(edgeRows[0].source_label).toBe('cn=finance-ops,ou=groups,dc=example,dc=com');
  });

  test('the actual bundled sample CSV parses into edge rows matching the relationship schema', () => {
    const csv = fs.readFileSync(
      path.join(__dirname, '../../lookups/graphlens_sample_relationships.csv'),
      'utf8',
    );
    const { nodeRows, edgeRows } = parseImportedGraphCsv(csv);
    expect(nodeRows).toHaveLength(0);
    expect(edgeRows.length).toBeGreaterThan(0);
    edgeRows.forEach((row) => {
      expect(row.source_id).toBeTruthy();
      expect(row.target_id).toBeTruthy();
      expect(row.relationship_type).toBeTruthy();
    });
  });

  test('a freshly imported CSV round-trips through transformRowsToGraph', () => {
    const csv = 'source_id,source_type,source_label,target_id,target_type,target_label,relationship_type,relationship_label\n'
      + 'user:jsmith,user,J Smith,host:server01,host,server01,AUTHENTICATED_TO,Authenticated to\n';
    const { nodeRows, edgeRows } = parseImportedGraphCsv(csv);
    const { nodes, edges } = transformRowsToGraph(nodeRows, edgeRows);
    expect(nodes.map((n) => n.data.id).sort()).toEqual(['host:server01', 'user:jsmith']);
    expect(edges).toHaveLength(1);
  });

  test('throws GraphLensValidationError for an empty file', () => {
    expect(() => parseImportedGraphCsv('')).toThrow(GraphLensValidationError);
    expect(() => parseImportedGraphCsv('   \n  ')).toThrow(GraphLensValidationError);
  });

  test('throws GraphLensValidationError when no row matches the relationship schema', () => {
    const csv = 'foo,bar\n1,2\n';
    expect(() => parseImportedGraphCsv(csv)).toThrow(GraphLensValidationError);
  });

  test('tolerates garbage/blank trailing lines without throwing', () => {
    const csv = 'node_id,node_type,node_label\nuser:jsmith,user,J Smith\n\n';
    const { nodeRows } = parseImportedGraphCsv(csv);
    expect(nodeRows).toHaveLength(1);
  });
});

describe('parseCsvRowObjects - the pre-classification step CsvImportPreviewDialog edits (1.19.0)', () => {
  test('returns the header and one plain object per data row, keyed by header', () => {
    const csv = 'source_id,target_id,relationship_type\nuser:jsmith,host:server01,AUTHENTICATED_TO\n';
    const { header, rows } = parseCsvRowObjects(csv);
    expect(header).toEqual(['source_id', 'target_id', 'relationship_type']);
    expect(rows).toEqual([{ source_id: 'user:jsmith', target_id: 'host:server01', relationship_type: 'AUTHENTICATED_TO' }]);
  });

  test('a row edited after parsing (simulating the preview dialog) still classifies correctly once fed back through parseImportedGraphCsv-style classification', () => {
    const csv = 'source_id,target_id,relationship_type\nuser:jsmith,host:server01,AUTHENTICATED_TO\n';
    const { rows } = parseCsvRowObjects(csv);
    rows[0].target_id = 'host:corrected01';
    const { edgeRows } = parseImportedGraphCsv('source_id,target_id,relationship_type\nuser:jsmith,host:corrected01,AUTHENTICATED_TO\n');
    expect(edgeRows[0].target_id).toBe(rows[0].target_id);
  });

  test('throws GraphLensValidationError for an empty file or one with no header row', () => {
    expect(() => parseCsvRowObjects('')).toThrow(GraphLensValidationError);
    expect(() => parseCsvRowObjects(',,\n1,2,3\n')).toThrow(GraphLensValidationError);
  });

  test('a CSV with only a header row (no data rows) parses to an empty rows array, not an error', () => {
    const { header, rows } = parseCsvRowObjects('source_id,target_id,relationship_type\n');
    expect(header).toEqual(['source_id', 'target_id', 'relationship_type']);
    expect(rows).toEqual([]);
  });
});
