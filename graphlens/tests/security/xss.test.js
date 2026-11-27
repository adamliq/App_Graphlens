/**
 * XSS regression tests (design brief section 29.3).
 *
 * Since 1.22.0 GraphLens stores node/edge display text (labels,
 * descriptions, edited values) as *plain text*, exactly as the source
 * data had it - "AT&T" stays "AT&T". The guarantee is no longer "markup
 * is escaped before it is stored" (that double-escaped legitimate text:
 * React then rendered the stored "AT&amp;T" literally) but:
 *
 *   1. Nothing in the app ever interprets display text as HTML - there is
 *      no HTML sink anywhere in src/ (asserted statically below), and
 *      Cytoscape draws labels onto a <canvas>, never as DOM.
 *   2. Every place that does turn display text into markup is React text
 *      content, which React escapes (asserted by rendering the real
 *      components - see xssRender.test.jsx).
 *   3. Text that leaves the app (JSON/CSV export, error messages) is
 *      either inert data or explicitly escaped/defanged where it lands.
 *
 * These tests pin all three down, plus the "an imported file / edit is
 * never trusted more than a live search result" path through the same
 * validation (control-character stripping, length caps).
 */
import fs from 'fs';
import path from 'path';
import { escapeHtml } from '../../src/main/webapp/shared/utilities/splSafety';
import { transformRowsToGraph, sanitizeNodeEdit, sanitizeEdgeEdit } from '../../src/main/webapp/shared/services/graphTransformer';
import { exportGraphAsJson } from '../../src/main/webapp/shared/services/exportService';
import { parseImportedGraphJson, parseImportedGraphCsv } from '../../src/main/webapp/shared/services/importService';

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '"><svg onload=alert(1)>',
  'javascript:alert(1)',
  '<a href="javascript:alert(1)">click</a>',
  '<iframe src="javascript:alert(1)"></iframe>',
  '<body onload=alert(1)>',
  '${alert(1)}',
  '{{constructor.constructor("alert(1)")()}}',
  '<svg/onload=alert(1)>',
];

describe('escapeHtml (still used where text is placed into an HTML string) neutralises every known XSS payload', () => {
  test.each(XSS_PAYLOADS)('payload: %j', (payload) => {
    const escaped = escapeHtml(payload);
    expect(escaped).not.toContain('<script');
    expect(escaped).not.toMatch(/<[a-z]/i);
  });
});

const SRC_ROOT = path.join(__dirname, '../../src');

function listSourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(jsx?|tsx?)$/.test(entry.name) ? [full] : [];
  });
}

// Comments may legitimately *name* a sink (e.g. graphTransformer.js's
// header explaining why none is used); only code counts.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const HTML_SINKS = [
  /dangerouslySetInnerHTML/,
  /\.innerHTML\b/,
  /\.outerHTML\b/,
  /insertAdjacentHTML/,
  /document\.write/,
  /createContextualFragment/,
  /DOMParser/,
  /\bnew\s+Function\s*\(/,
  /\beval\s*\(/,
  // Cytoscape extensions that render labels as HTML overlays instead of on the canvas.
  /cytoscape-node-html-label|nodeHtmlLabel|cytoscape-popper/,
];

describe('no source file contains an HTML sink, so display text stored as plain text is never interpreted as markup', () => {
  const files = listSourceFiles(SRC_ROOT);

  test('the scan actually covers the app source', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.some((f) => f.endsWith('NodeDetailsPanel.jsx'))).toBe(true);
    expect(files.some((f) => f.endsWith('GraphCanvas.jsx'))).toBe(true);
  });

  test.each(HTML_SINKS.map((re) => [re.source, re]))('no match for %s', (_name, re) => {
    const offenders = files.filter((f) => re.test(stripComments(fs.readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });
});

describe('graphTransformer stores display text verbatim (plain text), only stripping control characters', () => {
  test.each(XSS_PAYLOADS)('node_label is stored exactly as given: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: payload }], []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.label).toBe(payload);
  });

  test.each(XSS_PAYLOADS)('relationship_label is stored exactly as given: %j', (payload) => {
    const { edges } = transformRowsToGraph([], [{
      source_id: 'user:jsmith',
      target_id: 'host:server01',
      relationship_type: 'AUTHENTICATED_TO',
      relationship_label: payload,
    }]);
    expect(edges).toHaveLength(1);
    expect(edges[0].data.relationshipLabel).toBe(payload);
  });

  test.each(XSS_PAYLOADS)('node description is stored exactly as given: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: 'ok', description: payload }], []);
    expect(nodes[0].data.description).toBe(payload);
  });

  test('control characters are stripped from labels (they could otherwise smuggle terminal/log escapes into exports)', () => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: 'a\u0000b\u001b[31mc\u007f' }], []);
    expect(nodes[0].data.label).toBe('ab[31mc');
  });

  test('a label made only of control characters/whitespace falls back to the node id', () => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: '\u0001\u0002 ' }], []);
    expect(nodes[0].data.label).toBe('user:jsmith');
  });
});

describe('exported JSON carries a malicious label only as inert string data', () => {
  test.each(XSS_PAYLOADS)('payload round-trips through JSON.parse as the same plain string: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: payload }], []);
    const state = { visibleNodes: { [nodes[0].data.id]: nodes[0].data }, visibleEdges: {}, activeFilters: {} };
    const parsed = JSON.parse(exportGraphAsJson(state));
    expect(parsed.nodes[0].label).toBe(payload);
    expect(typeof parsed.nodes[0].label).toBe('string');
  });
});

describe('an imported file is never trusted more than a live search result - it goes through the same transformer', () => {
  test.each(XSS_PAYLOADS)('JSON import stores the payload as plain text: %j', (payload) => {
    const json = JSON.stringify({ metadata: { appVersion: '1.22.0' }, nodes: [{ id: 'user:jsmith', type: 'user', label: payload }], edges: [] });
    const { nodeRows, edgeRows } = parseImportedGraphJson(json);
    const { nodes } = transformRowsToGraph(nodeRows, edgeRows);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.label).toBe(payload);
  });

  test('decoding a pre-1.22 export cannot turn escaped markup into anything but plain text', () => {
    const json = JSON.stringify({ metadata: { appVersion: '1.21.0' }, nodes: [{ id: 'user:jsmith', type: 'user', label: '&lt;script&gt;alert(1)&lt;/script&gt;' }], edges: [] });
    const { nodeRows, edgeRows } = parseImportedGraphJson(json);
    const { nodes } = transformRowsToGraph(nodeRows, edgeRows);
    // Decoded back to the original text - which, like every label, is
    // only ever rendered as text (see the HTML-sink scan above).
    expect(nodes[0].data.label).toBe('<script>alert(1)</script>');
  });
});

function csvField(value) {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

describe('an imported CSV is never trusted more than a live search result', () => {
  test.each(XSS_PAYLOADS)('CSV import stores the payload as plain text: %j', (payload) => {
    const csv = `node_id,node_type,node_label\nuser:jsmith,user,${csvField(payload)}\n`;
    const { nodeRows, edgeRows } = parseImportedGraphCsv(csv);
    const { nodes } = transformRowsToGraph(nodeRows, edgeRows);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].data.label).toBe(payload);
  });
});

describe('editing a node/edge (graphlens_edit_graph_data) goes through the same sanitising as a fresh row', () => {
  test.each(XSS_PAYLOADS)('an edited node label is stored as plain text: %j', (payload) => {
    const { nodes } = transformRowsToGraph([{ node_id: 'user:jsmith', node_type: 'user', node_label: 'ok' }], []);
    const edited = sanitizeNodeEdit(nodes[0].data, { label: payload, riskScore: 0, eventCount: 0 });
    expect(edited.label).toBe(payload);
  });

  test.each(XSS_PAYLOADS)('an edited relationship label is stored as plain text: %j', (payload) => {
    const { edges } = transformRowsToGraph([], [{ source_id: 'user:jsmith', target_id: 'host:server01', relationship_type: 'AUTHENTICATED_TO' }]);
    const edited = sanitizeEdgeEdit(edges[0].data, { relationshipLabel: payload, riskScore: 0, eventCount: 0 });
    expect(edited.relationshipLabel).toBe(payload);
  });

  test('saving the same text repeatedly never compounds escaping ("AT&T" stays "AT&T" across saves)', () => {
    const { nodes } = transformRowsToGraph([{ node_id: 'org:att', node_type: 'org', node_label: 'AT&T <Mobility>' }], []);
    let data = nodes[0].data;
    for (let i = 0; i < 5; i += 1) {
      data = sanitizeNodeEdit(data, { label: data.label, description: 'Q&A "notes"', riskScore: 0, eventCount: 0 });
    }
    expect(data.label).toBe('AT&T <Mobility>');
    expect(data.description).toBe('Q&A "notes"');
  });
});
