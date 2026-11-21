import { findSingleRootNodeId, encodeSavedView, decodeSavedView } from '../../src/main/webapp/shared/services/savedViewsService';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

function baseState(overrides = {}) {
  return {
    visibleNodes: { 'user:alice': { id: 'user:alice', type: 'user' } },
    visibleEdges: {},
    expansionParents: {},
    expansionChildren: {},
    expandedNodeIds: [],
    pinnedNodeIds: [],
    hiddenNodeIds: [],
    hiddenNodeTypes: [],
    hiddenRelationshipTypes: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    activeFilters: { riskMin: 0, riskMax: 100, minEventCount: 0, timeEarliest: '-24h', timeLatest: 'now' },
    graphLimits: { maxVisibleNodes: 1000, maxVisibleEdges: 2500 },
    currentLayout: 'cose',
    ...overrides,
  };
}

beforeEach(() => {
  global.window.$C = { USERNAME: 'jdoe' };
});

describe('findSingleRootNodeId', () => {
  test('returns the lone node with no expansion-parent link', () => {
    const state = baseState({
      visibleNodes: {
        'user:alice': { id: 'user:alice' },
        'host:srv1': { id: 'host:srv1' },
      },
      expansionParents: { 'host:srv1': ['user:alice'] },
    });
    expect(findSingleRootNodeId(state)).toBe('user:alice');
  });

  test('throws when the graph is empty', () => {
    const state = baseState({ visibleNodes: {} });
    expect(() => findSingleRootNodeId(state)).toThrow(GraphLensValidationError);
  });

  test('throws when there is more than one root (e.g. an imported/query-loaded graph)', () => {
    const state = baseState({
      visibleNodes: {
        'user:alice': { id: 'user:alice' },
        'host:srv1': { id: 'host:srv1' },
      },
      expansionParents: {},
    });
    expect(() => findSingleRootNodeId(state)).toThrow(/more than one starting point/);
  });
});

describe('encodeSavedView / decodeSavedView', () => {
  test('round-trips a typical exploration session', () => {
    const state = baseState({
      visibleNodes: {
        'user:alice': { id: 'user:alice' },
        'host:srv1': { id: 'host:srv1' },
      },
      expansionParents: { 'host:srv1': ['user:alice'] },
      expandedNodeIds: ['user:alice'],
      pinnedNodeIds: ['host:srv1'],
      hiddenNodeTypes: ['process'],
      hiddenRelationshipTypes: ['OWNS'],
      activeFilters: { riskMin: 10, riskMax: 90, minEventCount: 2, timeEarliest: '-7d', timeLatest: 'now' },
      currentLayout: 'concentric',
    });

    const record = encodeSavedView({ state, viewName: '  Suspicious logins  ', description: 'investigation notes' });
    expect(record.view_name).toBe('Suspicious logins');
    expect(record.description).toBe('investigation notes');
    expect(record.owner).toBe('jdoe');
    expect(record.sharing).toBe('private');
    expect(record.initial_node_id).toBe('user:alice');
    expect(record.time_earliest).toBe('-7d');
    expect(record.time_latest).toBe('now');

    const decoded = decodeSavedView({ ...record, _key: 'view:abc123' });
    expect(decoded).toMatchObject({
      viewId: 'view:abc123',
      viewName: 'Suspicious logins',
      description: 'investigation notes',
      owner: 'jdoe',
      timeEarliest: '-7d',
      timeLatest: 'now',
      initialNodeId: 'user:alice',
      expandedNodeIds: ['user:alice'],
      pinnedNodeIds: ['host:srv1'],
      nodeFilters: { hiddenNodeTypes: ['process'], riskMin: 10, riskMax: 90, minEventCount: 2 },
      relationshipFilters: { hiddenRelationshipTypes: ['OWNS'] },
      layout: 'concentric',
    });
  });

  test('rejects an empty view name', () => {
    const state = baseState();
    expect(() => encodeSavedView({ state, viewName: '   ', description: '' })).toThrow(GraphLensValidationError);
  });

  test('propagates the single-root check (cannot save a multi-root graph)', () => {
    const state = baseState({
      visibleNodes: { 'user:alice': { id: 'user:alice' }, 'host:srv1': { id: 'host:srv1' } },
    });
    expect(() => encodeSavedView({ state, viewName: 'x', description: '' })).toThrow(/more than one starting point/);
  });

  test('decodeSavedView tolerates corrupt/missing JSON fields rather than throwing', () => {
    const decoded = decodeSavedView({
      _key: 'view:bad',
      view_name: 'Broken',
      expanded_node_ids: 'not json',
      pinned_node_ids: undefined,
      node_filters: '{"hiddenNodeTypes": "not-an-array"}',
      relationship_filters: '[]',
    });
    expect(decoded.expandedNodeIds).toEqual([]);
    expect(decoded.pinnedNodeIds).toEqual([]);
    expect(decoded.nodeFilters).toEqual({ hiddenNodeTypes: 'not-an-array' });
    expect(decoded.relationshipFilters).toEqual({});
  });
});
