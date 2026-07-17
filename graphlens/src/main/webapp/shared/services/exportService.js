/**
 * Produces safe, sanitised exports of the currently visible graph. Exports
 * only ever include data already present in graph state (i.e. data the
 * current user's searches already returned) - never a fresh, broader
 * search - so a user cannot use export to see more than their permissions
 * already allow.
 */
import { sanitizeForExportCell, escapeHtml } from '../utilities/splSafety';

function buildMetadata({ appVersion, timeEarliest, timeLatest, activeFilters, nodeCount, edgeCount }) {
  return {
    application: 'graphlens',
    appVersion,
    exportedAt: new Date().toISOString(),
    timeRange: { earliest: timeEarliest, latest: timeLatest },
    activeFilters,
    visibleNodeCount: nodeCount,
    visibleEdgeCount: edgeCount,
  };
}

export function exportGraphAsJson(graphState, { appVersion = '1.0.0' } = {}) {
  const nodes = Object.values(graphState.visibleNodes);
  const edges = Object.values(graphState.visibleEdges);
  const payload = {
    metadata: buildMetadata({
      appVersion,
      timeEarliest: graphState.activeFilters.timeEarliest,
      timeLatest: graphState.activeFilters.timeLatest,
      activeFilters: graphState.activeFilters,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    }),
    nodes: nodes.map(sanitizeNodeForExport),
    edges: edges.map(sanitizeEdgeForExport),
  };
  return JSON.stringify(payload, null, 2);
}

function sanitizeNodeForExport(node) {
  return {
    id: sanitizeForExportCell(node.id),
    label: sanitizeForExportCell(node.label),
    type: sanitizeForExportCell(node.type),
    group: sanitizeForExportCell(node.group || ''),
    riskScore: Number.isFinite(node.riskScore) ? node.riskScore : 0,
    eventCount: Number.isFinite(node.eventCount) ? node.eventCount : 0,
    firstSeen: sanitizeForExportCell(node.firstSeen || ''),
    lastSeen: sanitizeForExportCell(node.lastSeen || ''),
    sourceIndex: sanitizeForExportCell(node.sourceIndex || ''),
    sourceSourcetype: sanitizeForExportCell(node.sourceSourcetype || ''),
  };
}

function sanitizeEdgeForExport(edge) {
  return {
    id: sanitizeForExportCell(edge.id),
    source: sanitizeForExportCell(edge.source),
    target: sanitizeForExportCell(edge.target),
    relationship: sanitizeForExportCell(edge.relationship),
    relationshipLabel: sanitizeForExportCell(edge.relationshipLabel),
    directed: Boolean(edge.directed),
    eventCount: Number.isFinite(edge.eventCount) ? edge.eventCount : 0,
    riskScore: Number.isFinite(edge.riskScore) ? edge.riskScore : 0,
    firstSeen: sanitizeForExportCell(edge.firstSeen || ''),
    lastSeen: sanitizeForExportCell(edge.lastSeen || ''),
  };
}

function toCsv(headers, rows) {
  const escapeCell = (value) => {
    const str = String(value === undefined || value === null ? '' : value);
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => {
    lines.push(headers.map((h) => escapeCell(row[h])).join(','));
  });
  return lines.join('\r\n');
}

export function exportNodesAsCsv(graphState) {
  const nodes = Object.values(graphState.visibleNodes).map(sanitizeNodeForExport);
  return toCsv(
    ['id', 'label', 'type', 'group', 'riskScore', 'eventCount', 'firstSeen', 'lastSeen', 'sourceIndex', 'sourceSourcetype'],
    nodes,
  );
}

export function exportEdgesAsCsv(graphState) {
  const edges = Object.values(graphState.visibleEdges).map(sanitizeEdgeForExport);
  return toCsv(
    ['id', 'source', 'target', 'relationship', 'relationshipLabel', 'directed', 'eventCount', 'riskScore', 'firstSeen', 'lastSeen'],
    edges,
  );
}

/** Builds a downloadable Blob for the given export format ('json' | 'csv-nodes' | 'csv-edges'). Callers are responsible for revoking the returned object URL. */
export function buildExportBlob(format, graphState, options) {
  switch (format) {
    case 'json':
      return new Blob([exportGraphAsJson(graphState, options)], { type: 'application/json' });
    case 'csv-nodes':
      return new Blob([exportNodesAsCsv(graphState)], { type: 'text/csv' });
    case 'csv-edges':
      return new Blob([exportEdgesAsCsv(graphState)], { type: 'text/csv' });
    default:
      throw new Error(`Unsupported export format: ${escapeHtml(format)}`);
  }
}
