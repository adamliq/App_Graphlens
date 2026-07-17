/**
 * Performance sanity tests (design brief section 29.4). These are not a
 * substitute for testing against a real Splunk deployment under load -
 * see TESTING.md for the manual/CI procedure covering 100/500/1000-node
 * scenarios end to end - but they do assert that the purely client-side
 * pipeline (transform -> merge -> collapse -> render-selection) stays
 * within the documented graph limits and completes quickly even at the
 * largest supported scale, using only synthetic data generated in-memory.
 */
import { transformRowsToGraph } from '../../src/main/webapp/shared/services/graphTransformer';
import { createEmptyGraphState } from '../../src/main/webapp/shared/models/graphModel';
import { mergeExpansion, collapseNode, selectRenderableElements } from '../../src/main/webapp/shared/services/graphStateReducer';

function generateEdgeRows(count) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    rows.push({
      edge_id: `edge:${i}`,
      source_id: 'user:root',
      source_type: 'user',
      source_label: 'root',
      target_id: `host:h${i}`,
      target_type: 'host',
      target_label: `h${i}`,
      relationship_type: 'AUTHENTICATED_TO',
      relationship_label: 'Authenticated to',
      event_count: 1,
      risk_score: i % 100,
    });
  }
  return rows;
}

describe.each([
  [100, 250],
  [500, 1000],
  [1000, 2500],
])('graph scale: up to %i nodes / %i edges', (maxNodes, maxEdges) => {
  test('transform + merge stays within configured limits and completes quickly', () => {
    const rows = generateEdgeRows(maxEdges + 500); // deliberately oversupply to exercise the limit
    const start = Date.now();

    const { nodes, edges, diagnostics } = transformRowsToGraph([], rows, { maxNodes, maxEdges });

    let state = createEmptyGraphState({ graphLimits: { maxVisibleNodes: maxNodes, maxVisibleEdges: maxEdges } });
    state.visibleNodes['user:root'] = { id: 'user:root', label: 'root', type: 'user', riskScore: 0, eventCount: 0 };
    const { nextState } = mergeExpansion(state, 'user:root', { nodes, edges }, state.graphLimits);

    const elapsedMs = Date.now() - start;

    expect(Object.keys(nextState.visibleNodes).length).toBeLessThanOrEqual(maxNodes);
    expect(Object.keys(nextState.visibleEdges).length).toBeLessThanOrEqual(maxEdges);
    expect(diagnostics.limitReached).toBe(true);
    // Generous ceiling for a CI sandbox; this is a smoke test for
    // pathological O(n^2) behaviour, not a strict benchmark.
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('repeated expand/collapse cycles do not leak nodes or degrade', () => {
  test('100 expand/collapse cycles on the same node leave the graph in a consistent, bounded state', () => {
    let state = createEmptyGraphState({ graphLimits: { maxVisibleNodes: 1000, maxVisibleEdges: 2500 } });
    state.visibleNodes['user:root'] = { id: 'user:root', label: 'root', type: 'user', riskScore: 0, eventCount: 0 };

    const rows = generateEdgeRows(50);
    const { nodes, edges } = transformRowsToGraph([], rows, { maxNodes: 1000, maxEdges: 2500 });

    const start = Date.now();
    for (let i = 0; i < 100; i += 1) {
      const { nextState } = mergeExpansion(state, 'user:root', { nodes, edges }, state.graphLimits);
      state = nextState;
      state = collapseNode(state, 'user:root');
    }
    const elapsedMs = Date.now() - start;

    // After the final collapse, only the root remains.
    expect(Object.keys(state.visibleNodes)).toEqual(['user:root']);
    expect(Object.keys(state.visibleEdges)).toHaveLength(0);
    expect(elapsedMs).toBeLessThan(5000);
  });
});

describe('selectRenderableElements scales linearly enough for interactive use', () => {
  test('filtering a 1000-node / 2500-edge graph completes well under a frame budget-friendly threshold', () => {
    const rows = generateEdgeRows(2500);
    const { nodes, edges } = transformRowsToGraph([], rows, { maxNodes: 1000, maxEdges: 2500 });
    let state = createEmptyGraphState({ graphLimits: { maxVisibleNodes: 1000, maxVisibleEdges: 2500 } });
    state.visibleNodes['user:root'] = { id: 'user:root', label: 'root', type: 'user', riskScore: 0, eventCount: 0 };
    state = mergeExpansion(state, 'user:root', { nodes, edges }, state.graphLimits).nextState;

    const start = Date.now();
    const renderable = selectRenderableElements(state);
    const elapsedMs = Date.now() - start;

    expect(renderable.nodes.length).toBeGreaterThan(0);
    expect(elapsedMs).toBeLessThan(500);
  });
});
