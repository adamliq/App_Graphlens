import { useReducer, useMemo, useCallback } from 'react';
import { createEmptyGraphState } from '../models/graphModel';
import * as ops from '../services/graphStateReducer';

const ACTIONS = {
  SET_INITIAL_NODE: 'SET_INITIAL_NODE',
  MERGE_EXPANSION: 'MERGE_EXPANSION',
  COLLAPSE_NODE: 'COLLAPSE_NODE',
  HIDE_NODE: 'HIDE_NODE',
  UNHIDE_NODE: 'UNHIDE_NODE',
  PIN_NODE: 'PIN_NODE',
  UNPIN_NODE: 'UNPIN_NODE',
  UPDATE_NODE_DATA: 'UPDATE_NODE_DATA',
  UPDATE_EDGE_DATA: 'UPDATE_EDGE_DATA',
  SELECT_NODE: 'SELECT_NODE',
  SELECT_EDGE: 'SELECT_EDGE',
  CLEAR_SELECTION: 'CLEAR_SELECTION',
  SET_HIDDEN_NODE_TYPES: 'SET_HIDDEN_NODE_TYPES',
  SET_HIDDEN_RELATIONSHIP_TYPES: 'SET_HIDDEN_RELATIONSHIP_TYPES',
  SET_ACTIVE_FILTERS: 'SET_ACTIVE_FILTERS',
  SET_LAYOUT: 'SET_LAYOUT',
  RESET: 'RESET',
  LOAD_SNAPSHOT: 'LOAD_SNAPSHOT',
  REPLACE_STATE: 'REPLACE_STATE',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_INITIAL_NODE:
      return ops.setInitialNode(state, action.node);
    case ACTIONS.MERGE_EXPANSION: {
      const { nextState } = ops.mergeExpansion(state, action.parentNodeId, action.elements, action.limits);
      return nextState;
    }
    case ACTIONS.COLLAPSE_NODE:
      return ops.collapseNode(state, action.nodeId);
    case ACTIONS.HIDE_NODE:
      return ops.hideNode(state, action.nodeId);
    case ACTIONS.UNHIDE_NODE:
      return ops.unhideNode(state, action.nodeId);
    case ACTIONS.PIN_NODE:
      return ops.pinNode(state, action.nodeId);
    case ACTIONS.UNPIN_NODE:
      return ops.unpinNode(state, action.nodeId);
    case ACTIONS.UPDATE_NODE_DATA:
      return ops.updateNodeData(state, action.nodeId, action.nextData);
    case ACTIONS.UPDATE_EDGE_DATA:
      return ops.updateEdgeData(state, action.edgeId, action.nextData);
    case ACTIONS.SELECT_NODE:
      return ops.selectNode(state, action.nodeId);
    case ACTIONS.SELECT_EDGE:
      return ops.selectEdge(state, action.edgeId);
    case ACTIONS.CLEAR_SELECTION:
      return ops.clearSelection(state);
    case ACTIONS.SET_HIDDEN_NODE_TYPES:
      return ops.setHiddenNodeTypes(state, action.types);
    case ACTIONS.SET_HIDDEN_RELATIONSHIP_TYPES:
      return ops.setHiddenRelationshipTypes(state, action.types);
    case ACTIONS.SET_ACTIVE_FILTERS:
      return ops.setActiveFilters(state, action.filters);
    case ACTIONS.SET_LAYOUT:
      return ops.setLayout(state, action.layoutName);
    case ACTIONS.RESET:
      return ops.resetGraph(state);
    case ACTIONS.LOAD_SNAPSHOT: {
      const { nextState } = ops.loadGraphSnapshot(state, action.elements, action.limits);
      return nextState;
    }
    case ACTIONS.REPLACE_STATE:
      return action.state;
    default:
      return state;
  }
}

/**
 * React binding for the pure graph-state reducer. Returns the current
 * state plus a stable set of action dispatchers; all expand/collapse/
 * dedup/reference-counting logic lives in services/graphStateReducer.js.
 */
export function useGraphState(initialLimits) {
  const [state, dispatch] = useReducer(reducer, undefined, () => createEmptyGraphState(
    initialLimits ? { graphLimits: initialLimits } : undefined,
  ));

  const actions = useMemo(() => ({
    setInitialNode: (node) => dispatch({ type: ACTIONS.SET_INITIAL_NODE, node }),
    mergeExpansion: (parentNodeId, elements, limits) => dispatch({ type: ACTIONS.MERGE_EXPANSION, parentNodeId, elements, limits }),
    collapseNode: (nodeId) => dispatch({ type: ACTIONS.COLLAPSE_NODE, nodeId }),
    hideNode: (nodeId) => dispatch({ type: ACTIONS.HIDE_NODE, nodeId }),
    unhideNode: (nodeId) => dispatch({ type: ACTIONS.UNHIDE_NODE, nodeId }),
    pinNode: (nodeId) => dispatch({ type: ACTIONS.PIN_NODE, nodeId }),
    unpinNode: (nodeId) => dispatch({ type: ACTIONS.UNPIN_NODE, nodeId }),
    updateNodeData: (nodeId, nextData) => dispatch({ type: ACTIONS.UPDATE_NODE_DATA, nodeId, nextData }),
    updateEdgeData: (edgeId, nextData) => dispatch({ type: ACTIONS.UPDATE_EDGE_DATA, edgeId, nextData }),
    selectNode: (nodeId) => dispatch({ type: ACTIONS.SELECT_NODE, nodeId }),
    selectEdge: (edgeId) => dispatch({ type: ACTIONS.SELECT_EDGE, edgeId }),
    clearSelection: () => dispatch({ type: ACTIONS.CLEAR_SELECTION }),
    setHiddenNodeTypes: (types) => dispatch({ type: ACTIONS.SET_HIDDEN_NODE_TYPES, types }),
    setHiddenRelationshipTypes: (types) => dispatch({ type: ACTIONS.SET_HIDDEN_RELATIONSHIP_TYPES, types }),
    setActiveFilters: (filters) => dispatch({ type: ACTIONS.SET_ACTIVE_FILTERS, filters }),
    setLayout: (layoutName) => dispatch({ type: ACTIONS.SET_LAYOUT, layoutName }),
    reset: () => dispatch({ type: ACTIONS.RESET }),
    loadSnapshot: (elements, limits) => dispatch({ type: ACTIONS.LOAD_SNAPSHOT, elements, limits }),
    // An escape hatch for a caller that has already computed a whole next
    // state by composing the pure functions above itself (see
    // savedViewsService.js's replay in RelationshipExplorer/App.jsx,
    // which must build several mergeExpansion steps in sequence before
    // any one of them can safely reach React state - see its own comment
    // for why). Not for ordinary use; prefer a dedicated action above.
    replaceState: (nextState) => dispatch({ type: ACTIONS.REPLACE_STATE, state: nextState }),
  }), []);

  const renderable = useMemo(() => ops.selectRenderableElements(state), [state]);

  const isNodeExpanded = useCallback((nodeId) => state.expandedNodeIds.includes(nodeId), [state.expandedNodeIds]);
  const isNodePinned = useCallback((nodeId) => state.pinnedNodeIds.includes(nodeId), [state.pinnedNodeIds]);

  return { state, actions, renderable, isNodeExpanded, isNodePinned };
}
