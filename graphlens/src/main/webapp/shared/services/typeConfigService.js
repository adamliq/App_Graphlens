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
 * Since 1.24.0 every node type also gets a shape (configured, or
 * `shapeForType`), and it is the colour+shape pair that is kept distinct.
 * None of these 19 colours overlap the fixed status-indicator colours used
 * on the canvas for risk/pinned/selected/path-highlight (see
 * GraphCanvas.jsx's STATUS_COLORS) - a type should never look like one of
 * those states by coincidence.
 */
import { queryCollection } from './kvStoreService';

// 1.24.0: every colour is >= 3.6:1 against the canvas background
// (#fafafa) - WCAG 2.2 1.4.11 asks 3:1 of graphics needed to understand
// content, and several of the previous 19 (light greens/yellows/cyans)
// were 1.7-2.3:1. Greens near the path-highlight green (85-175 degrees)
// and the risk red (< 12 / > 350 degrees) are left out, so a type can't
// look like a status. Ordered so consecutive entries are far apart in
// hue. Generated with HSL(h, 72%, L) with L solved for ~3.6:1.
export const FALLBACK_PALETTE = [
  '#DE5935', '#1D8EB1', '#BF53E3', '#AF791D', '#5081E2',
  '#DF3DC2', '#828916', '#8074E8', '#E24B85', '#189295',
  '#A862E6', '#CC6821', '#2387D9', '#D938DF', '#968318',
  '#6C7AE7', '#E145A3', '#6D8E17', '#936DE7',
];

// Shapes Cytoscape actually supports, in the order automatic shapes are
// handed out (1.24.0) - so a type without a configured shape is no longer
// distinguishable by colour alone (WCAG 1.4.1). Also used to discard an
// unsupported configured shape (the pre-1.24 seed used "cylinder").
export const AUTO_SHAPES = ['ellipse', 'round-rectangle', 'diamond', 'hexagon', 'triangle', 'star', 'tag', 'barrel', 'pentagon', 'octagon', 'rhomboid', 'vee'];
const VALID_SHAPES = new Set([
  ...AUTO_SHAPES, 'rectangle', 'round-triangle', 'bottom-round-rectangle', 'cut-rectangle', 'right-rhomboid',
  'round-diamond', 'round-pentagon', 'round-hexagon', 'concave-hexagon', 'heptagon', 'round-heptagon',
  'round-octagon', 'round-tag',
]);

export function normalizeShape(shape) {
  return typeof shape === 'string' && VALID_SHAPES.has(shape) ? shape : null;
}

function hashString(str, seed) {
  let hash = seed;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic automatic shape for an uncurated type name (1.24.0). */
export function shapeForType(typeName) {
  return AUTO_SHAPES[hashString(String(typeName || 'unknown'), 7) % AUTO_SHAPES.length];
}

export function colorForType(typeName) {
  return FALLBACK_PALETTE[hashString(String(typeName || 'unknown'), 0) % FALLBACK_PALETTE.length];
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
  const usedColors = new Set();
  const resolved = new Map();
  sorted.forEach(({ key, color, shape, curated }) => {
    // 1.24.0: a *curated* node type is only re-coloured when another
    // visible type has the same colour AND shape - two types that share a
    // colour but differ in shape are already told apart, and bumping one
    // anyway made a curated type's colour change from graph to graph
    // depending on what else was on screen. An automatic (uncurated)
    // colour, and every relationship type (no shape), is still kept
    // distinct by colour alone.
    const pairId = (c) => `${c}|${shape || ''}`;
    const clashes = (c) => used.has(pairId(c)) || (!(curated && shape) && usedColors.has(c));
    let finalColor = color;
    if (clashes(finalColor)) {
      const freeColor = FALLBACK_PALETTE.find((c) => !clashes(c));
      if (freeColor) finalColor = freeColor;
    }
    used.add(pairId(finalColor));
    usedColors.add(finalColor);
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
        shape: normalizeShape(row.shape) || shapeForType(row.node_type),
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

/** Builds the list of { node_type, display_label, color, shape } for legend/filter UI (and, via the colour, for the canvas itself - see RelationshipExplorer/App.jsx) from whatever node types are actually present in the current graph, enriched with curated config where available, with colours resolved distinct via resolveDistinctColors. */
export function deriveNodeTypeList(nodes, nodeTypeConfig) {
  const seen = new Map();
  nodes.forEach((n) => {
    if (seen.has(n.type)) return;
    const config = nodeTypeConfig[n.type];
    seen.set(n.type, {
      node_type: n.type,
      display_label: (config && config.display_label) || n.type,
      color: (config && config.color) || colorForType(n.type),
      shape: (config && normalizeShape(config.shape)) || shapeForType(n.type),
      curated: Boolean(config && config.color),
    });
  });
  const resolvedColors = resolveDistinctColors(
    Array.from(seen.values()).map((v) => ({ key: v.node_type, color: v.color, shape: v.shape, curated: v.curated })),
  );
  return Array.from(seen.values()).map(({ curated: _curated, ...v }) => ({ ...v, color: resolvedColors.get(v.node_type) }));
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
