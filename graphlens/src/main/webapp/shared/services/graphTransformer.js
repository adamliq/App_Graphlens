/**
 * Converts raw Splunk search result rows into Cytoscape.js-ready node and
 * edge elements. This is the single place where result rows are validated,
 * deduplicated, escaped for display and bounded by the configured graph
 * limits - the browser-side counterpart to the SPL-level validation in
 * default/macros.conf.
 */
import { isValidId, escapeHtml, clampInteger } from '../utilities/splSafety';

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLabel(label, fallback) {
  const str = typeof label === 'string' && label.trim().length > 0 ? label : fallback;
  return escapeHtml(str).slice(0, 200);
}

function toRiskScore(value) {
  const num = typeof value === 'number' ? value : parseFloat(value);
  if (!Number.isFinite(num)) return 0;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function toEventCount(value) {
  return clampInteger(value, { min: 0, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
}

/**
 * @param {Array<Object>} nodeRows - rows with node_id/node_type/node_label/...
 * @param {Array<Object>} edgeRows - rows with edge_id/source_id/target_id/relationship_type/...
 * @param {Object} [options]
 * @param {number} [options.maxNodes]
 * @param {number} [options.maxEdges]
 * @param {Record<string, {color?: string, shape?: string, icon?: string}>} [options.nodeTypeConfig]
 * @param {Record<string, {color?: string, directed?: boolean}>} [options.relationshipTypeConfig]
 * @returns {{nodes: Array, edges: Array, diagnostics: import('../models/graphModel').TransformDiagnostics}}
 */
export function transformRowsToGraph(nodeRows = [], edgeRows = [], options = {}) {
  const maxNodes = clampInteger(options.maxNodes, { min: 1, max: 100000, fallback: 1000 });
  const maxEdges = clampInteger(options.maxEdges, { min: 1, max: 250000, fallback: 2500 });
  const nodeTypeConfig = options.nodeTypeConfig || {};
  const relationshipTypeConfig = options.relationshipTypeConfig || {};

  const diagnostics = {
    rejectedRows: 0,
    duplicateNodes: 0,
    duplicateEdges: 0,
    limitReached: false,
    rejectionReasons: [],
  };

  const nodesById = new Map();
  const edgesById = new Map();

  const upsertNode = (rawNode) => {
    if (!isPlainObject(rawNode) || !isValidId(rawNode.node_id)) {
      diagnostics.rejectedRows += 1;
      diagnostics.rejectionReasons.push('invalid node_id');
      return;
    }
    const id = rawNode.node_id;
    const typeConfig = nodeTypeConfig[rawNode.node_type] || {};
    const incoming = {
      id,
      label: safeLabel(rawNode.node_label, id),
      type: typeof rawNode.node_type === 'string' ? rawNode.node_type.slice(0, 64) : 'unknown',
      group: typeof rawNode.node_group === 'string' ? rawNode.node_group.slice(0, 64) : undefined,
      description: typeof rawNode.description === 'string' ? escapeHtml(rawNode.description).slice(0, 1000) : undefined,
      riskScore: toRiskScore(rawNode.risk_score),
      firstSeen: rawNode.first_seen || undefined,
      lastSeen: rawNode.last_seen || undefined,
      eventCount: toEventCount(rawNode.event_count),
      sourceIndex: typeof rawNode.source_index === 'string' ? rawNode.source_index.slice(0, 128) : undefined,
      sourceSourcetype: typeof rawNode.source_sourcetype === 'string' ? rawNode.source_sourcetype.slice(0, 128) : undefined,
      color: typeConfig.color,
      shape: typeConfig.shape,
      icon: typeConfig.icon,
    };

    if (nodesById.has(id)) {
      diagnostics.duplicateNodes += 1;
      const existing = nodesById.get(id);
      // Merge: keep the widest first_seen/last_seen span and the highest
      // risk score / event count observed across duplicate rows, rather
      // than silently overwriting with whichever row arrived last.
      nodesById.set(id, {
        ...existing,
        firstSeen: minIso(existing.firstSeen, incoming.firstSeen),
        lastSeen: maxIso(existing.lastSeen, incoming.lastSeen),
        riskScore: Math.max(existing.riskScore, incoming.riskScore),
        eventCount: existing.eventCount + incoming.eventCount,
        description: existing.description || incoming.description,
      });
      return;
    }

    if (nodesById.size >= maxNodes) {
      diagnostics.limitReached = true;
      return;
    }
    nodesById.set(id, incoming);
  };

  const upsertEdge = (rawEdge) => {
    if (!isPlainObject(rawEdge) || !isValidId(rawEdge.source_id) || !isValidId(rawEdge.target_id)) {
      diagnostics.rejectedRows += 1;
      diagnostics.rejectionReasons.push('invalid source_id/target_id');
      return;
    }
    const relationshipType = typeof rawEdge.relationship_type === 'string' ? rawEdge.relationship_type.slice(0, 64) : 'RELATED_TO';
    const id = isValidId(rawEdge.edge_id)
      ? rawEdge.edge_id
      : deriveEdgeId(rawEdge.source_id, rawEdge.target_id, relationshipType);

    const typeConfig = relationshipTypeConfig[relationshipType] || {};
    const incoming = {
      id,
      source: rawEdge.source_id,
      target: rawEdge.target_id,
      relationship: relationshipType,
      relationshipLabel: safeLabel(rawEdge.relationship_label, relationshipType),
      directed: typeof rawEdge.directed === 'boolean' ? rawEdge.directed : typeConfig.directed !== false,
      eventCount: toEventCount(rawEdge.event_count),
      riskScore: toRiskScore(rawEdge.risk_score),
      firstSeen: rawEdge.first_seen || undefined,
      lastSeen: rawEdge.last_seen || undefined,
      sourceIndex: typeof rawEdge.source_index === 'string' ? rawEdge.source_index.slice(0, 128) : undefined,
      sourceSourcetype: typeof rawEdge.source_sourcetype === 'string' ? rawEdge.source_sourcetype.slice(0, 128) : undefined,
      evidenceReference: isValidId(rawEdge.evidence_reference) ? rawEdge.evidence_reference : undefined,
      color: typeConfig.color,
    };

    if (edgesById.has(id)) {
      diagnostics.duplicateEdges += 1;
      const existing = edgesById.get(id);
      edgesById.set(id, {
        ...existing,
        firstSeen: minIso(existing.firstSeen, incoming.firstSeen),
        lastSeen: maxIso(existing.lastSeen, incoming.lastSeen),
        riskScore: Math.max(existing.riskScore, incoming.riskScore),
        eventCount: existing.eventCount + incoming.eventCount,
      });
      return;
    }

    if (edgesById.size >= maxEdges) {
      diagnostics.limitReached = true;
      return;
    }
    edgesById.set(id, incoming);

    // Ensure both endpoints exist as nodes even if the caller only supplied
    // edge rows (e.g. a one-hop expansion result), using the source/target
    // type+label columns present on the edge row itself. upsertNode is
    // called unconditionally (not guarded by nodesById.has) so that a node
    // referenced by more than one edge row still goes through the
    // dedup/merge path below and its diagnostics are counted correctly.
    if (isValidId(rawEdge.source_id)) {
      upsertNode({
        node_id: rawEdge.source_id,
        node_type: rawEdge.source_type,
        node_label: rawEdge.source_label,
        source_index: rawEdge.source_index,
        source_sourcetype: rawEdge.source_sourcetype,
      });
    }
    if (isValidId(rawEdge.target_id)) {
      upsertNode({
        node_id: rawEdge.target_id,
        node_type: rawEdge.target_type,
        node_label: rawEdge.target_label,
        source_index: rawEdge.source_index,
        source_sourcetype: rawEdge.source_sourcetype,
      });
    }
  };

  nodeRows.forEach(upsertNode);
  edgeRows.forEach(upsertEdge);

  const nodes = Array.from(nodesById.values()).map((data) => ({ data }));
  const edges = Array.from(edgesById.values()).map((data) => ({ data }));

  return { nodes, edges, diagnostics };
}

function minIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function maxIso(a, b) {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Deterministically derive a safe edge id from its endpoints and
 * relationship type when a search result omits edge_id. Uses a
 * non-cryptographic hash - collisions merely coalesce two visually
 * identical relationships, which is the desired de-duplication behaviour.
 */
export function deriveEdgeId(sourceId, targetId, relationshipType) {
  const basis = `${sourceId}|${targetId}|${relationshipType}`;
  let hash = 0;
  for (let i = 0; i < basis.length; i += 1) {
    hash = (hash * 31 + basis.charCodeAt(i)) >>> 0;
  }
  return `edge:${hash.toString(16)}`;
}
