import { parseGraphQuery as parseQuery } from '../../src/main/webapp/shared/services/graphQueryLanguage';
import { executeGraphQuery } from '../../src/main/webapp/shared/services/graphQueryExecutor';
import { GraphLensValidationError } from '../../src/main/webapp/shared/utilities/splSafety';

const ALICE_SEARCH_ROW = {
  node_id: 'user:alice', node_type: 'user', node_label: 'Alice',
  event_count: 5, risk_score: 10, first_seen: '2026-01-01', last_seen: '2026-01-02',
  source_index: 'idx', source_sourcetype: 'st',
};

const SRV1_SEARCH_ROW = {
  node_id: 'host:srv1', node_type: 'host', node_label: 'Srv1',
  event_count: 2, risk_score: 0, source_index: 'idx', source_sourcetype: 'st',
};

const ALICE_EDGE_ROWS = [
  {
    edge_id: 'edge:alice-srv1', source_id: 'user:alice', source_type: 'user', source_label: 'Alice',
    target_id: 'host:srv1', target_type: 'host', target_label: 'Srv1',
    relationship_type: 'LOGGED_IN', relationship_label: 'Logged in', event_count: 3, risk_score: 20,
    source_index: 'idx', source_sourcetype: 'st', evidence_reference: '',
  },
  {
    edge_id: 'edge:alice-bob', source_id: 'user:alice', source_type: 'user', source_label: 'Alice',
    target_id: 'user:bob', target_type: 'user', target_label: 'Bob',
    relationship_type: 'FRIEND_OF', relationship_label: 'Friend of', event_count: 1, risk_score: 5,
    source_index: 'idx', source_sourcetype: 'st', evidence_reference: '',
  },
];

const BOB_EDGE_ROWS = [
  {
    edge_id: 'edge:bob-alice', source_id: 'user:bob', source_type: 'user', source_label: 'Bob',
    target_id: 'user:alice', target_type: 'user', target_label: 'Alice',
    relationship_type: 'FRIEND_OF', relationship_label: 'Friend of', event_count: 1, risk_score: 5,
    source_index: 'idx', source_sourcetype: 'st', evidence_reference: '',
  },
];

function makeDispatch(expandRowsByNodeId = {}, { initialRows = [ALICE_SEARCH_ROW] } = {}) {
  return jest.fn(async (spl) => {
    if (spl.includes('node_label="*')) {
      return { rows: initialRows };
    }
    const match = Object.keys(expandRowsByNodeId).find((nodeId) => spl.includes(`source_id="${nodeId}"`));
    return { rows: match ? expandRowsByNodeId[match] : [] };
  });
}

const settings = { maxExpansionDepth: 3, maxExpansionNeighbours: 100, maxVisibleNodes: 1000, maxVisibleEdges: 2500, relationshipSourceType: 'index' };

test('resolves a root node via "search" and returns requested scalar fields, with no expansion dispatched', async () => {
  const ast = parseQuery('{ node(search: "alice") { id label riskScore } }');
  const dispatch = makeDispatch();
  const result = await executeGraphQuery(ast, { settings, dispatch });

  expect(result.tree).toEqual([{ id: 'user:alice', label: 'Alice', riskScore: 10 }]);
  expect(result.nodes.map((n) => n.data.id)).toEqual(['user:alice']);
  expect(result.edges).toEqual([]);
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(result.diagnostics.totalExpansions).toBe(0);
});

test('resolves a root node via "id" by expanding it once', async () => {
  const ast = parseQuery('{ node(id: "user:alice") { id label } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });

  expect(result.tree).toEqual([{ id: 'user:alice', label: 'Alice' }]);
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test('"id" root resolves to nothing when the node has no relationships', async () => {
  const ast = parseQuery('{ node(id: "user:ghost") { id } }');
  const dispatch = makeDispatch({});
  const result = await executeGraphQuery(ast, { settings, dispatch });
  expect(result.tree).toEqual([]);
  expect(result.nodes).toEqual([]);
});

test('traverses a relationship field matched case-insensitively against relationship_type', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id label } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });

  expect(result.tree).toEqual([{ id: 'user:alice', FRIEND_OF: [{ id: 'user:bob', label: 'Bob' }] }]);
  expect(result.nodes.map((n) => n.data.id).sort()).toEqual(['user:alice', 'user:bob']);
  expect(result.edges.map((e) => e.data.id)).toEqual(['edge:alice-bob']);
});

test('an explicit "type" argument overrides the field name for relationship-type matching', async () => {
  // GraphLens's grammar has no field aliases (see KNOWN_LIMITATIONS.md) -
  // the field is named arbitrarily and `type` supplies the real relationship_type.
  const ast = parseQuery('{ node(search: "alice") { id logins(type: "LOGGED_IN") { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });
  expect(result.tree).toEqual([{ id: 'user:alice', logins: [{ id: 'host:srv1' }] }]);
});

test('filters by direction: OUTGOING excludes edges where the current node is the target', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF(direction: OUTGOING) { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });
  expect(result.tree).toEqual([{ id: 'user:alice', FRIEND_OF: [{ id: 'user:bob' }] }]);
});

test('filters by direction: INCOMING excludes edges where the current node is the source', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF(direction: INCOMING) { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });
  expect(result.tree).toEqual([{ id: 'user:alice', FRIEND_OF: [] }]);
});

test('expands a given node at most once even when referenced by multiple relationship fields', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id } LOGGED_IN { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  await executeGraphQuery(ast, { settings, dispatch });
  // One call for the root search, one for alice's single expansion - never two.
  expect(dispatch).toHaveBeenCalledTimes(2);
});

test('refuses to recurse into an ancestor node (cycle detection), but still includes the edge/node', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id FRIEND_OF { id FRIEND_OF { id } } } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS, 'user:bob': BOB_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });

  const bobEntry = result.tree[0].FRIEND_OF[0];
  expect(bobEntry.id).toBe('user:bob');
  const aliceAgain = bobEntry.FRIEND_OF[0];
  expect(aliceAgain.id).toBe('user:alice');
  expect(aliceAgain.cycleTruncated).toBe(true);
  expect(aliceAgain.FRIEND_OF).toBeUndefined();
  // Only alice and bob were ever actually expanded (root search + 2 expansions).
  expect(dispatch).toHaveBeenCalledTimes(3);
});

test('rejects a query whose relationship nesting exceeds settings.maxExpansionDepth', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id FRIEND_OF { id } } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS, 'user:bob': BOB_EDGE_ROWS });
  await expect(executeGraphQuery(ast, { settings: { ...settings, maxExpansionDepth: 1 }, dispatch }))
    .rejects.toThrow(GraphLensValidationError);
  expect(dispatch).not.toHaveBeenCalled();
});

test('rejects an unknown scalar field name before dispatching anything', async () => {
  const ast = parseQuery('{ node(search: "alice") { id notARealField } }');
  const dispatch = makeDispatch();
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/Unknown field/);
  expect(dispatch).not.toHaveBeenCalled();
});

test('rejects an invalid "direction" argument value', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF(direction: SIDEWAYS) { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/direction/i);
});

test('rejects a root field with neither "search" nor "id"', async () => {
  const ast = parseQuery('{ node(limit: 5) { id } }');
  const dispatch = makeDispatch();
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/"search" or an "id"/);
});

test('applies the root "type" argument as a client-side filter over search results', async () => {
  const ast = parseQuery('{ node(search: "a", type: "host") { id } }');
  const dispatch = makeDispatch({}, { initialRows: [ALICE_SEARCH_ROW, SRV1_SEARCH_ROW] });
  const result = await executeGraphQuery(ast, { settings, dispatch });
  expect(result.tree).toEqual([{ id: 'host:srv1' }]);
});

test('a crafted malicious "id" argument is rejected by the existing identifier validator without ever dispatching a search', async () => {
  const ast = parseQuery('{ node(id: "user:alice\\" OR 1=1") { id } }');
  const dispatch = makeDispatch({});
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(GraphLensValidationError);
  expect(dispatch).not.toHaveBeenCalled();
});

test('a malicious "search" term is sanitized the same way the entity search box sanitizes it, not passed through verbatim', async () => {
  const ast = parseQuery('{ node(search: "alice\\" | delete") { id } }');
  const dispatch = jest.fn(async (spl) => {
    // sanitizeSearchTerm strips quotes/pipes/backslashes entirely, so the
    // injected "| delete" command can never survive into the dispatched SPL
    // - only the template's own literal quotes around the cleaned term remain.
    expect(spl).not.toContain('| delete');
    expect(spl).not.toContain('\\"');
    return { rows: [] };
  });
  await executeGraphQuery(ast, { settings, dispatch });
  expect(dispatch).toHaveBeenCalledTimes(1);
});

test('requires a dispatch function', async () => {
  const ast = parseQuery('{ node(search: "alice") { id } }');
  await expect(executeGraphQuery(ast, { settings })).rejects.toThrow(GraphLensValidationError);
});

test('an "id"-rooted query reuses its own root expansion for a relationship field instead of dispatching it twice', async () => {
  const ast = parseQuery('{ node(id: "user:alice") { id FRIEND_OF { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  const result = await executeGraphQuery(ast, { settings, dispatch });

  expect(result.tree).toEqual([{ id: 'user:alice', FRIEND_OF: [{ id: 'user:bob' }] }]);
  // A single expansion resolves both the root itself and its FRIEND_OF
  // field - not one dispatch to resolve the root and a second, identical
  // one when the relationship field is processed.
  expect(dispatch).toHaveBeenCalledTimes(1);
  expect(result.diagnostics.totalExpansions).toBe(1);
});

test('diagnostics.truncated reflects rows dropped by the configured graph-size limits, not only the query-expansion budget', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  // ALICE_EDGE_ROWS has two edges; capping maxVisibleEdges at 1 forces
  // transformRowsToGraph to drop the second (FRIEND_OF) during alice's
  // expansion.
  const tightSettings = { ...settings, maxVisibleEdges: 1 };
  const result = await executeGraphQuery(ast, { settings: tightSettings, dispatch });

  expect(result.tree).toEqual([{ id: 'user:alice', FRIEND_OF: [] }]);
  expect(result.diagnostics.truncated).toBe(true);
});

test('a bare word in place of a quoted string argument is rejected, not silently ignored', async () => {
  // type: host (a bare word/enum) instead of type: "host" - the root's
  // type filter must not be silently dropped just because it was
  // spelled wrong.
  const ast = parseQuery('{ node(search: "a", type: host) { id } }');
  const dispatch = makeDispatch({}, { initialRows: [ALICE_SEARCH_ROW, SRV1_SEARCH_ROW] });
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/must be a quoted string/);
  expect(dispatch).not.toHaveBeenCalled();
});

test('a quoted string in place of a bare-word direction argument is rejected, not silently defaulted', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF(direction: "OUTGOING") { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS });
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/must be a bare word/);
  expect(dispatch).not.toHaveBeenCalled();
});

test('a quoted string in place of an integer "limit" argument is rejected before any search runs', async () => {
  const ast = parseQuery('{ node(search: "alice", limit: "ten") { id } }');
  const dispatch = makeDispatch();
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/must be an integer/);
  expect(dispatch).not.toHaveBeenCalled();
});

test('argument-type errors on a deeply nested relationship field are still caught before any search runs', async () => {
  const ast = parseQuery('{ node(search: "alice") { id FRIEND_OF { id FRIEND_OF(limit: "lots") { id } } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS, 'user:bob': BOB_EDGE_ROWS });
  await expect(executeGraphQuery(ast, { settings, dispatch })).rejects.toThrow(/must be an integer/);
  expect(dispatch).not.toHaveBeenCalled();
});

test('resolves independent root matches concurrently and still returns a correct, ordered tree', async () => {
  const ast = parseQuery('{ node(search: "a") { id FRIEND_OF { id } } }');
  const dispatch = makeDispatch({ 'user:alice': ALICE_EDGE_ROWS, 'host:srv1': [] }, { initialRows: [ALICE_SEARCH_ROW, SRV1_SEARCH_ROW] });
  const result = await executeGraphQuery(ast, { settings, dispatch });

  expect(result.tree).toEqual([
    { id: 'user:alice', FRIEND_OF: [{ id: 'user:bob' }] },
    { id: 'host:srv1', FRIEND_OF: [] },
  ]);
});
