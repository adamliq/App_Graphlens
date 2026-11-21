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
 *
 * `colorForType` alone is not collision-free: two different type names can
 * hash to the same palette entry (confirmed live - e.g. "user"/"group"/"ip"
 * all landed on the same purple with the original 10-colour palette),
 * which silently defeats the whole point of colour-coding types. Expanded
 * to 19 colours (lower collision odds) and, more importantly,
 * `deriveNodeTypeList`/`deriveRelationshipTypeList` below now run a second,
 * deterministic pass (`resolveDistinctColors`) over whatever types are
 * actually visible at once, reassigning any duplicate to the next unused
 * palette colour - so the set of types on screen right now is guaranteed
 * collision-free (up to 19 distinct types), not just unlikely to collide.
 * None of these 19 colours overlap the fixed status-indicator colours used
 * on the canvas for risk/pinned/selected/path-highlight (see
 * GraphCanvas.jsx's STATUS_COLORS) - a type should never look like one of
 * those states by coincidence.
 */
import { queryCollection } from './kvStoreService';

const FALLBACK_PALETTE = [
  '#D0BF25', '#729B27', '#47D025', '#279B78', '#25B6D0',
  '#2D279B', '#7A25D0', '#95279B', '#D0258C', '#9B7E27',
  '#AED025', '#4F9B27', '#25D036', '#279B9B', '#2536D0',
  '#4F279B', '#AE25D0', '#9B277E', '#D02558',
];

export function colorForType(typeName) {
  const str = String(typeName || 'unknown');
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_PALETTE[hash % FALLBACK_PALETTE.length];
}

/**
 * Given `entries` (an array of `{ key, color }`, one per type currently
 * visible), returns a `Map<key, color>` where every value is distinct
 * whenever that's possible within the palette - the first occurrence of a
 * given colour (in `key`-sorted order, so the result doesn't depend on
 * insertion/search order) keeps it; any later type that would otherwise
 * share that colour is bumped to the next palette colour not already
 * assigned. If more distinct types than palette colours are visible at
 * once, the remainder keep their original (possibly colliding) colour -
 * an acceptable, rare degradation rather than a hard limit.
 */
export function resolveDistinctColors(entries) {
  const sorted = [...entries].sort((a, b) => a.key.localeCompare(b.key));
  const used = new Set();
  const resolved = new Map();
  sorted.forEach(({ key, color }) => {
    let finalColor = color;
    if (used.has(finalColor)) {
      const freeColor = FALLBACK_PALETTE.find((c) => !used.has(c));
      if (freeColor) finalColor = freeColor;
    }
    used.add(finalColor);
    resolved.set(key, finalColor);
  });
  return resolved;
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

/** Builds the list of { node_type, display_label, color } for legend/filter UI (and, via the colour, for the canvas itself - see RelationshipExplorer/App.jsx) from whatever node types are actually present in the current graph, enriched with curated config where available, with colours resolved distinct via resolveDistinctColors. */
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
  const resolvedColors = resolveDistinctColors(
    Array.from(seen.values()).map((v) => ({ key: v.node_type, color: v.color })),
  );
  return Array.from(seen.values()).map((v) => ({ ...v, color: resolvedColors.get(v.node_type) }));
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
  const resolvedColors = resolveDistinctColors(
    Array.from(seen.values()).map((v) => ({ key: v.relationship_type, color: v.color })),
  );
  return Array.from(seen.values()).map((v) => ({ ...v, color: resolvedColors.get(v.relationship_type) }));
}
