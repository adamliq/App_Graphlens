/**
 * Converts raw Splunk search result rows into Cytoscape.js-ready node and
 * edge elements. This is the single place where result rows are validated,
 * deduplicated, cleaned for display and bounded by the configured graph
 * limits - the browser-side counterpart to the SPL-level validation in
 * default/macros.conf.
 *
 * Display text (labels, descriptions) is stored as plain text, NOT
 * HTML-escaped (1.22.0): every place it is shown renders it as text, never
 * as markup - React text nodes and the Cytoscape canvas - so escaping it
 * here only made "AT&T" display as "AT&amp;T", and compounded on every
 * edit-and-save. tests/security/xss.test.js enforces that no source file
 * uses an HTML sink (dangerouslySetInnerHTML, innerHTML, ...) that would
 * make storing raw text unsafe; see SECURITY.md.
 */
import { isValidId, clampInteger } from '../utilities/splSafety';

// Control characters are stripped from all display text; a description
// keeps its own line breaks and tabs, a single-line label does not.
const LABEL_CONTROL_CHARS = /[\x00-\x1f\x7f]/g; // eslint-disable-line no-control-regex
const DESCRIPTION_CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g; // eslint-disable-line no-control-regex

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeLabel(label, fallback) {
  const cleaned = typeof label === 'string' ? label.replace(LABEL_CONTROL_CHARS, '') : '';
  const str = cleaned.trim().length > 0 ? cleaned : fallback;
  return String(str).slice(0, 200);
}

function safeDescription(value) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(DESCRIPTION_CONTROL_CHARS, '');
  return cleaned.trim() ? cleaned.slice(0, 1000) : undefined;
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
      description: safeDescription(rawNode.description),
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

/**
 * Applies a user-supplied edit (NodeDetailsPanel's edit mode, gated by
 * the graphlens_edit_graph_data capability, 1.19.0) to an
 * already-admitted node, replacing its editable fields exactly the way
 * upsertNode above builds them fresh from a row - the same
 * control-character-stripping/riskScore-clamping/eventCount-clamping/length-capping -
 * so a hand-typed edit can never bypass the sanitisation any other
 * node admission path already gets. `id` is never touched: changing it
 * would just be creating a different node under a confusing guise.
 * `patch` is a flat object of raw (untrusted) form values, not a
 * Cytoscape-shaped node - same shape a node row from transformRowsToGraph
 * would carry, keyed by the same field names this function reads off
 * `existingNode` (its own output shape), not the node_* row names.
 */
export function sanitizeNodeEdit(existingNode, patch, nodeTypeConfig = {}) {
  const type = typeof patch.type === 'string' && patch.type.trim() ? patch.type.slice(0, 64) : existingNode.type;
  const typeConfig = nodeTypeConfig[type] || {};
  return {
    ...existingNode,
    label: safeLabel(patch.label, existingNode.id),
    type,
    group: typeof patch.group === 'string' && patch.group.trim() ? patch.group.slice(0, 64) : undefined,
    description: safeDescription(patch.description),
    riskScore: toRiskScore(patch.riskScore),
    eventCount: toEventCount(patch.eventCount),
    firstSeen: patch.firstSeen || undefined,
    lastSeen: patch.lastSeen || undefined,
    sourceIndex: typeof patch.sourceIndex === 'string' && patch.sourceIndex.trim() ? patch.sourceIndex.slice(0, 128) : undefined,
    sourceSourcetype: typeof patch.sourceSourcetype === 'string' && patch.sourceSourcetype.trim() ? patch.sourceSourcetype.slice(0, 128) : undefined,
    color: typeConfig.color,
    shape: typeConfig.shape,
    icon: typeConfig.icon,
  };
}

/** The edge counterpart to sanitizeNodeEdit above - see its doc comment. `source`/`target`/`id` are never touched; changing an edge's endpoints is out of scope for "edit", not a sanitisation gap. */
export function sanitizeEdgeEdit(existingEdge, patch, relationshipTypeConfig = {}) {
  const relationshipType = typeof patch.relationship === 'string' && patch.relationship.trim() ? patch.relationship.slice(0, 64) : existingEdge.relationship;
  const typeConfig = relationshipTypeConfig[relationshipType] || {};
  return {
    ...existingEdge,
    relationship: relationshipType,
    relationshipLabel: safeLabel(patch.relationshipLabel, relationshipType),
    directed: typeof patch.directed === 'boolean' ? patch.directed : existingEdge.directed,
    riskScore: toRiskScore(patch.riskScore),
    eventCount: toEventCount(patch.eventCount),
    firstSeen: patch.firstSeen || undefined,
    lastSeen: patch.lastSeen || undefined,
    color: typeConfig.color,
  };
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
