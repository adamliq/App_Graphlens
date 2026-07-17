/**
 * Shared constants and JSDoc-documented shapes for the GraphLens node/edge
 * data model. See DATA_MODEL.md for the authoritative schema description.
 *
 * @typedef {Object} GraphLensNode
 * @property {string} node_id
 * @property {string} node_type
 * @property {string} node_label
 * @property {string} [node_group]
 * @property {string} [description]
 * @property {number} [risk_score]
 * @property {string} [first_seen]
 * @property {string} [last_seen]
 * @property {number} [event_count]
 * @property {string} [source_index]
 * @property {string} [source_sourcetype]
 * @property {Object} [metadata]
 *
 * @typedef {Object} GraphLensEdge
 * @property {string} edge_id
 * @property {string} source_id
 * @property {string} target_id
 * @property {string} relationship_type
 * @property {string} relationship_label
 * @property {boolean} directed
 * @property {string} [first_seen]
 * @property {string} [last_seen]
 * @property {number} [event_count]
 * @property {number} [risk_score]
 * @property {string} [source_index]
 * @property {string} [source_sourcetype]
 * @property {string} [evidence_reference]
 * @property {Object} [metadata]
 *
 * @typedef {Object} CytoscapeNodeElement
 * @property {{id: string, label: string, type: string, riskScore: number, [key: string]: any}} data
 *
 * @typedef {Object} CytoscapeEdgeElement
 * @property {{id: string, source: string, target: string, relationship: string, eventCount: number, [key: string]: any}} data
 *
 * @typedef {Object} TransformDiagnostics
 * @property {number} rejectedRows
 * @property {number} duplicateNodes
 * @property {number} duplicateEdges
 * @property {boolean} limitReached
 * @property {string[]} rejectionReasons
 */

export const DEFAULT_GRAPH_LIMITS = Object.freeze({
  maxVisibleNodes: 1000,
  maxVisibleEdges: 2500,
  maxExpansionNeighbours: 100,
  maxExpansionDepth: 3,
  maxPathDepth: 5,
});

export const DEFAULT_LAYOUT = 'cose';

/** Creates an empty, well-formed graph state object (see section 10 of the design brief / ARCHITECTURE.md). */
export function createEmptyGraphState(overrides = {}) {
  return {
    visibleNodes: {},
    visibleEdges: {},
    expandedNodeIds: [],
    expansionParents: {}, // childNodeId -> parentNodeId that introduced it
    expansionChildren: {}, // parentNodeId -> Set-like array of childNodeIds introduced by expanding it
    pinnedNodeIds: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    hiddenNodeIds: [], // individually hidden via "Hide" action, distinct from type-based hiding below
    hiddenNodeTypes: [],
    hiddenRelationshipTypes: [],
    activeFilters: {
      riskMin: 0,
      riskMax: 100,
      minEventCount: 0,
      timeEarliest: '-24h',
      timeLatest: 'now',
      indexes: [],
      sourcetypes: [],
    },
    graphLimits: { ...DEFAULT_GRAPH_LIMITS },
    currentLayout: DEFAULT_LAYOUT,
    ...overrides,
  };
}
