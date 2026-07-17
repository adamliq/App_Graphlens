import { createEmptyGraphState } from '../../src/main/webapp/shared/models/graphModel';
import {
  mergeExpansion,
  collapseNode,
  pinNode,
  unpinNode,
  selectNode,
  hideNode,
  unhideNode,
  setInitialNode,
  selectRenderableElements,
  setActiveFilters,
} from '../../src/main/webapp/shared/services/graphStateReducer';

function node(id, type = 'user') {
  return { id, label: id, type, riskScore: 10, eventCount: 1 };
}

function edge(id, source, target, relationship = 'RELATED_TO') {
  return { id, source, target, relationship, relationshipLabel: relationship, directed: true, eventCount: 1, riskScore: 10 };
}

function cyEls(nodes, edges) {
  return { nodes: nodes.map((data) => ({ data })), edges: edges.map((data) => ({ data })) };
}

describe('setInitialNode', () => {
  test('replaces the whole graph with a single root node and selects it', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('user:root'));
    expect(Object.keys(state.visibleNodes)).toEqual(['user:root']);
    expect(state.selectedNodeId).toBe('user:root');
  });
});

describe('mergeExpansion', () => {
  test('adds neighbours and records the parent-child expansion link', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    const elements = cyEls([node('B'), node('C')], [edge('e1', 'A', 'B'), edge('e2', 'A', 'C')]);
    const { nextState, diagnostics } = mergeExpansion(state, 'A', elements, state.graphLimits);
    expect(diagnostics.alreadyExpanded).toBe(false);
    expect(Object.keys(nextState.visibleNodes).sort()).toEqual(['A', 'B', 'C']);
    expect(nextState.expandedNodeIds).toEqual(['A']);
    expect(nextState.expansionChildren.A.sort()).toEqual(['B', 'C']);
    expect(nextState.expansionParents.B).toEqual(['A']);
  });

  test('is a no-op when the node is already expanded', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    const elements = cyEls([node('B')], [edge('e1', 'A', 'B')]);
    const first = mergeExpansion(state, 'A', elements, state.graphLimits).nextState;
    const second = mergeExpansion(first, 'A', cyEls([node('D')], [edge('e2', 'A', 'D')]), first.graphLimits);
    expect(second.diagnostics.alreadyExpanded).toBe(true);
    expect(second.nextState).toBe(first);
  });

  test('respects maxVisibleNodes and reports limitReached', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    const many = Array.from({ length: 10 }, (_, i) => node(`N${i}`));
    const manyEdges = many.map((n, i) => edge(`e${i}`, 'A', n.id));
    const limits = { ...state.graphLimits, maxVisibleNodes: 3 };
    const { nextState, diagnostics } = mergeExpansion(state, 'A', cyEls(many, manyEdges), limits);
    expect(Object.keys(nextState.visibleNodes).length).toBeLessThanOrEqual(3);
    expect(diagnostics.limitReached).toBe(true);
  });
});

describe('collapseNode - reference counting', () => {
  function buildDiamond() {
    // A -> B -> D
    // A -> C -> D   (D has two parents: B and C)
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    state = mergeExpansion(state, 'A', cyEls([node('B'), node('C')], [edge('ab', 'A', 'B'), edge('ac', 'A', 'C')]), state.graphLimits).nextState;
    state = mergeExpansion(state, 'B', cyEls([node('D')], [edge('bd', 'B', 'D')]), state.graphLimits).nextState;
    state = mergeExpansion(state, 'C', cyEls([node('D')], [edge('cd', 'C', 'D')]), state.graphLimits).nextState;
    return state;
  }

  test('collapsing B removes only what B introduced, not B itself; D survives via C', () => {
    let state = buildDiamond();
    expect(state.visibleNodes.D).toBeDefined();
    state = collapseNode(state, 'B');
    // Collapsing a node removes the nodes IT introduced, not the node
    // itself - B stays visible (just no longer expanded) so it can be
    // expanded again later.
    expect(state.visibleNodes.B).toBeDefined();
    expect(state.expandedNodeIds).not.toContain('B');
    expect(state.visibleNodes.D).toBeDefined();
    expect(state.expansionParents.D).toEqual(['C']);
  });

  test('collapsing the last remaining path removes the introduced node (D), not the collapsed node (C) itself', () => {
    let state = buildDiamond();
    state = collapseNode(state, 'B');
    state = collapseNode(state, 'C');
    expect(state.visibleNodes.C).toBeDefined();
    expect(state.expandedNodeIds).not.toContain('C');
    expect(state.visibleNodes.D).toBeUndefined(); // D's only remaining parent (C) was just collapsed
    expect(state.visibleEdges.cd).toBeUndefined();
  });

  test('cascades: removing an orphaned node also removes nodes it had itself introduced', () => {
    // A -> B -> D -> E (single chain, no alternate path to D or E).
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    state = mergeExpansion(state, 'A', cyEls([node('B')], [edge('ab', 'A', 'B')]), state.graphLimits).nextState;
    state = mergeExpansion(state, 'B', cyEls([node('D')], [edge('bd', 'B', 'D')]), state.graphLimits).nextState;
    state = mergeExpansion(state, 'D', cyEls([node('E')], [edge('de', 'D', 'E')]), state.graphLimits).nextState;

    state = collapseNode(state, 'B');

    expect(state.visibleNodes.D).toBeUndefined();
    expect(state.visibleNodes.E).toBeUndefined(); // cascaded: E was only reachable through D
    expect(state.visibleEdges.de).toBeUndefined();
    expect(state.expandedNodeIds).not.toContain('D');
  });

  test('pinned nodes are retained even when their only expansion path is collapsed', () => {
    let state = buildDiamond();
    state = pinNode(state, 'D');
    state = collapseNode(state, 'B');
    state = collapseNode(state, 'C');
    expect(state.visibleNodes.D).toBeDefined();
  });

  test('the selected node is retained even when its only expansion path is collapsed', () => {
    let state = buildDiamond();
    state = selectNode(state, 'D');
    state = collapseNode(state, 'B');
    state = collapseNode(state, 'C');
    expect(state.visibleNodes.D).toBeDefined();
  });

  test('collapsing a node that is not expanded is a no-op', () => {
    const state = createEmptyGraphState();
    const next = collapseNode(state, 'nonexistent');
    expect(next).toBe(state);
  });

  test('unpinning then collapsing removes a previously-protected node', () => {
    let state = buildDiamond();
    state = pinNode(state, 'D');
    state = unpinNode(state, 'D');
    state = collapseNode(state, 'B');
    state = collapseNode(state, 'C');
    expect(state.visibleNodes.D).toBeUndefined();
  });

  test('removes edges incident to a removed node', () => {
    let state = buildDiamond();
    state = collapseNode(state, 'B');
    state = collapseNode(state, 'C');
    expect(Object.values(state.visibleEdges).some((e) => e.source === 'D' || e.target === 'D')).toBe(false);
  });
});

describe('hideNode / unhideNode', () => {
  test('hidden nodes are excluded from renderable elements without losing underlying state', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    state = mergeExpansion(state, 'A', cyEls([node('B')], [edge('ab', 'A', 'B')]), state.graphLimits).nextState;
    state = hideNode(state, 'B');
    let renderable = selectRenderableElements(state);
    expect(renderable.nodes.map((n) => n.id)).not.toContain('B');
    expect(state.visibleNodes.B).toBeDefined(); // still tracked, just hidden

    state = unhideNode(state, 'B');
    renderable = selectRenderableElements(state);
    expect(renderable.nodes.map((n) => n.id)).toContain('B');
  });

  test('an edge is excluded from renderable elements if either endpoint is hidden', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    state = mergeExpansion(state, 'A', cyEls([node('B')], [edge('ab', 'A', 'B')]), state.graphLimits).nextState;
    state = hideNode(state, 'B');
    const renderable = selectRenderableElements(state);
    expect(renderable.edges).toHaveLength(0);
  });
});

describe('selectRenderableElements - risk and event-count filters', () => {
  test('filters out nodes below the minimum risk score', () => {
    let state = createEmptyGraphState();
    state = setInitialNode(state, node('A'));
    state.visibleNodes.A.riskScore = 10;
    state = mergeExpansion(state, 'A', cyEls([{ ...node('B'), riskScore: 90 }], [edge('ab', 'A', 'B')]), state.graphLimits).nextState;
    state = setActiveFilters(state, { riskMin: 50, riskMax: 100 });
    const renderable = selectRenderableElements(state);
    expect(renderable.nodes.map((n) => n.id)).toEqual(['B']);
  });
});
