/**
 * Node-type and relationship-type display configuration (colour, shape,
 * icon, enabled flag). Administrator-curated entries live in the
 * graphlens_node_types / graphlens_relationship_types KV Store
 * collections (see collections.conf); a bundled CSV
 * (lookups/graphlens_node_types_seed.csv) provides sensible starting
 * values an administrator can load into KV Store once, after install,
 * with:
 *   | inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types
 *   | inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types
 * (see INSTALL.md). Until that has been done - or for any type an
 * administrator has not curated - GraphLens falls back to a deterministic
 * colour derived from the type name so the graph always renders sensibly.
 */
import { queryCollection } from './kvStoreService';

const FALLBACK_PALETTE = [
  '#5A2BE2', '#2B7DE9', '#E97D2B', '#2BB6E9', '#2BE9A0',
  '#E92B4C', '#B22B2B', '#7D2BE9', '#2B4CE9', '#2B9BE9',
];

export function colorForType(typeName) {
  const str = String(typeName || 'unknown');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

export async function loadNodeTypeConfig({ fetchImpl } = {}) {
  try {
    const body = await queryCollection('graphlens_node_types', { limit: 500, fetchImpl });
    const map = {};
    (Array.isArray(body) ? body : []).forEach((row) => {
      if (row.enabled === false) return;
      map[row.node_type] = {
        display_label: row.display_label || row.node_type,
        color: row.color || colorForType(row.node_type),
        shape: row.shape || 'ellipse',
        icon: row.icon,
      };
    });
    return map;
  } catch (err) {
    return {};
  }
}

export async function loadRelationshipTypeConfig({ fetchImpl } = {}) {
  try {
    const body = await queryCollection('graphlens_relationship_types', { limit: 500, fetchImpl });
    const map = {};
    (Array.isArray(body) ? body : []).forEach((row) => {
      if (row.enabled === false) return;
      map[row.relationship_type] = {
        display_label: row.display_label || row.relationship_type,
        color: row.color || colorForType(row.relationship_type),
        directed: row.directed !== false,
      };
    });
    return map;
  } catch (err) {
    return {};
  }
}

/** Builds the list of { node_type, display_label, color } for legend/filter UI from whatever types are actually present in the current graph, enriched with curated config where available. */
export function deriveNodeTypeList(nodes, nodeTypeConfig) {
  const seen = new Map();
  nodes.forEach((n) => {
    if (seen.has(n.type)) return;
    const config = nodeTypeConfig[n.type];
    seen.set(n.type, {
      node_type: n.type,
      display_label: (config && config.display_label) || n.type,
      color: (config && config.color) || colorForType(n.type),
    });
  });
  return Array.from(seen.values());
}

export function deriveRelationshipTypeList(edges, relationshipTypeConfig) {
  const seen = new Map();
  edges.forEach((e) => {
    if (seen.has(e.relationship)) return;
    const config = relationshipTypeConfig[e.relationship];
    seen.set(e.relationship, {
      relationship_type: e.relationship,
      display_label: (config && config.display_label) || e.relationship,
      color: (config && config.color) || colorForType(e.relationship),
    });
  });
  return Array.from(seen.values());
}
