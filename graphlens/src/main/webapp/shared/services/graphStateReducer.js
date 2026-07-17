/**
 * Pure reducer implementing GraphLens's lazy expansion/collapse graph
 * state (ARCHITECTURE.md section "Expansion and collapse"). Kept free of
 * React and of any network/search code so it can be unit tested in
 * isolation (see tests/unit/graphStateReducer.test.js) and so the
 * expand/collapse reference-counting logic - the trickiest part of the
 * whole application - lives in exactly one place.
 */
import { createEmptyGraphState } from '../models/graphModel';

function withoutDuplicates(array) {
  return Array.from(new Set(array));
}

function addParentChildLink(state, parentId, childId) {
  if (parentId === childId) return;
  const parents = new Set(state.expansionParents[childId] || []);
  parents.add(parentId);
  state.expansionParents[childId] = Array.from(parents);

  const children = new Set(state.expansionChildren[parentId] || []);
  children.add(childId);
  state.expansionChildren[parentId] = Array.from(children);
}

function removeEdgesTouching(state, nodeId) {
  Object.values(state.visibleEdges).forEach((edge) => {
    if (edge.source === nodeId || edge.target === nodeId) {
      delete state.visibleEdges[edge.id];
    }
  });
}

/**
 * Merge the result of expanding `parentNodeId` (an already-visible node)
 * into the graph. `nodes`/`edges` are Cytoscape-shaped elements
 * ({ data: {...} }) as produced by graphTransformer.transformRowsToGraph.
 * No-ops (returns state unchanged, diagnostics.alreadyExpanded=true) if
 * the node is already expanded, per the "check whether it is already
 * expanded" requirement.
 */
export function mergeExpansion(state, parentNodeId, { nodes = [], edges = [] }, limits) {
  if (!state.visibleNodes[parentNodeId]) {
    throw new Error(`Cannot expand a node that is not visible: ${parentNodeId}`);
  }
  if (state.expandedNodeIds.includes(parentNodeId)) {
    return { nextState: state, diagnostics: { alreadyExpanded: true, limitReached: false } };
  }

  const next = {
    ...state,
    visibleNodes: { ...state.visibleNodes },
    visibleEdges: { ...state.visibleEdges },
    expansionParents: { ...state.expansionParents },
    expansionChildren: { ...state.expansionChildren },
  };

  const maxNodes = (limits && limits.maxVisibleNodes) || state.graphLimits.maxVisibleNodes;
  const maxEdges = (limits && limits.maxVisibleEdges) || state.graphLimits.maxVisibleEdges;
  let limitReached = false;

  nodes.forEach(({ data }) => {
    const childId = data.id;
    if (childId === parentNodeId) return;
    if (!next.visibleNodes[childId]) {
      if (Object.keys(next.visibleNodes).length >= maxNodes) {
        limitReached = true;
        return;
      }
      next.visibleNodes[childId] = data;
    }
    addParentChildLink(next, parentNodeId, childId);
  });

  edges.forEach(({ data }) => {
    if (next.visibleEdges[data.id]) return;
    // Only admit an edge if both endpoints made it into the visible graph
    // (an endpoint may have been dropped by the node limit above).
    if (!next.visibleNodes[data.source] || !next.visibleNodes[data.target]) return;
    if (Object.keys(next.visibleEdges).length >= maxEdges) {
      limitReached = true;
      return;
    }
    next.visibleEdges[data.id] = data;
  });

  next.expandedNodeIds = withoutDuplicates([...state.expandedNodeIds, parentNodeId]);

  return { nextState: next, diagnostics: { alreadyExpanded: false, limitReached } };
}

/**
 * Collapse `nodeId`. Nodes introduced solely through this expansion are
 * removed (reference counting - a node introduced via more than one
 * expansion path is retained), pinned nodes are always retained, and the
 * currently selected node is retained so the details panel does not go
 * stale mid-investigation. Removal cascades: if a removed node was itself
 * expanded, its own children are processed the same way.
 */
export function collapseNode(state, nodeId) {
  if (!state.expandedNodeIds.includes(nodeId)) {
    return state; // nothing to collapse
  }

  const next = {
    ...state,
    visibleNodes: { ...state.visibleNodes },
    visibleEdges: { ...state.visibleEdges },
    expansionParents: { ...state.expansionParents },
    expansionChildren: { ...state.expansionChildren },
    expandedNodeIds: [...state.expandedNodeIds],
    pinnedNodeIds: [...state.pinnedNodeIds],
  };

  const queue = [nodeId];
  const processed = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (processed.has(current)) continue;
    processed.add(current);

    const children = next.expansionChildren[current] || [];
    children.forEach((childId) => {
      const remainingParents = (next.expansionParents[childId] || []).filter((p) => p !== current);
      next.expansionParents[childId] = remainingParents;

      const stillNeeded = remainingParents.length > 0
        || next.pinnedNodeIds.includes(childId)
        || childId === next.selectedNodeId;

      if (!stillNeeded) {
        delete next.visibleNodes[childId];
        delete next.expansionParents[childId];
        removeEdgesTouching(next, childId);
        if (next.expandedNodeIds.includes(childId)) {
          queue.push(childId);
        }
      }
    });

    delete next.expansionChildren[current];
    next.expandedNodeIds = next.expandedNodeIds.filter((id) => id !== current);
  }

  return next;
}

export function hideNode(state, nodeId) {
  return { ...state, hiddenNodeIds: withoutDuplicates([...state.hiddenNodeIds, nodeId]) };
}

export function unhideNode(state, nodeId) {
  return { ...state, hiddenNodeIds: state.hiddenNodeIds.filter((id) => id !== nodeId) };
}

export function pinNode(state, nodeId) {
  return { ...state, pinnedNodeIds: withoutDuplicates([...state.pinnedNodeIds, nodeId]) };
}

export function unpinNode(state, nodeId) {
  return { ...state, pinnedNodeIds: state.pinnedNodeIds.filter((id) => id !== nodeId) };
}

export function selectNode(state, nodeId) {
  return { ...state, selectedNodeId: nodeId, selectedEdgeId: null };
}

export function selectEdge(state, edgeId) {
  return { ...state, selectedEdgeId: edgeId, selectedNodeId: null };
}

export function clearSelection(state) {
  return { ...state, selectedNodeId: null, selectedEdgeId: null };
}

export function setHiddenNodeTypes(state, types) {
  return { ...state, hiddenNodeTypes: [...types] };
}

export function setHiddenRelationshipTypes(state, types) {
  return { ...state, hiddenRelationshipTypes: [...types] };
}

export function setActiveFilters(state, filters) {
  return { ...state, activeFilters: { ...state.activeFilters, ...filters } };
}

export function setLayout(state, layoutName) {
  return { ...state, currentLayout: layoutName };
}

/** Replace the whole graph with a single root node (a fresh entity search result). */
export function setInitialNode(state, node) {
  const empty = createEmptyGraphState({ graphLimits: state.graphLimits, currentLayout: state.currentLayout, activeFilters: state.activeFilters });
  empty.visibleNodes[node.id] = node;
  empty.selectedNodeId = node.id;
  return empty;
}

export function resetGraph(state) {
  return createEmptyGraphState({ graphLimits: state.graphLimits, currentLayout: state.currentLayout });
}

/**
 * Nodes/edges as they should be rendered right now: visible minus
 * individually-hidden nodes minus nodes/relationships hidden by type.
 */
export function selectRenderableElements(state) {
  const hiddenTypeSet = new Set(state.hiddenNodeTypes);
  const hiddenRelSet = new Set(state.hiddenRelationshipTypes);
  const hiddenNodeSet = new Set(state.hiddenNodeIds);
  const filters = state.activeFilters || {};
  const riskMin = Number.isFinite(filters.riskMin) ? filters.riskMin : 0;
  const riskMax = Number.isFinite(filters.riskMax) ? filters.riskMax : 100;
  const minEventCount = Number.isFinite(filters.minEventCount) ? filters.minEventCount : 0;

  const nodes = Object.values(state.visibleNodes).filter(
    (n) => !hiddenNodeSet.has(n.id)
      && !hiddenTypeSet.has(n.type)
      && (n.riskScore || 0) >= riskMin
      && (n.riskScore || 0) <= riskMax,
  );
  const visibleNodeIds = new Set(nodes.map((n) => n.id));

  const edges = Object.values(state.visibleEdges).filter(
    (e) => visibleNodeIds.has(e.source)
      && visibleNodeIds.has(e.target)
      && !hiddenRelSet.has(e.relationship)
      && (e.eventCount || 0) >= minEventCount,
  );

  return { nodes, edges };
}
