/**
 * Saved graph views: a named "recipe" for reconstructing a graph that
 * started from a single search result - which node to start from and
 * which of its neighbours were expanded, in order - stored in the
 * graphlens_saved_views KV Store collection (see collections.conf).
 *
 * Deliberately not a frozen snapshot (that is what Export/Import is for -
 * see exportService.js/importService.js). Loading a saved view re-runs
 * the same buildExpandNodeSpl dispatches a live exploration already uses,
 * so it always shows current data for the same nodes, the same way
 * returning to a bookmarked search would. A node with no relationships
 * left by the time a view is loaded, or a once-expanded node that no
 * longer has that neighbour, is handled exactly as it already is
 * elsewhere in the app (see KNOWN_LIMITATIONS.md).
 *
 * Private only (no sharing UI in this release, even though the
 * collection's schema already has a `sharing` column for a future one):
 * every write sets sharing="private" and owner=the current username, and
 * every read filters to the current username. Like the rest of GraphLens
 * (see the audit log's precedent in SECURITY.md), this is a UI
 * convenience, not a hard access-control boundary - Splunk's own KV Store
 * ACL on the collection is the actual authority, exactly as
 * kvStoreService.js's own header comment says.
 */
import { queryCollection, insertRecord, deleteRecord } from './kvStoreService';
import { getCurrentUsername } from '../utilities/restClient';
import { sanitizeForExportCell, GraphLensValidationError } from '../utilities/splSafety';

const COLLECTION = 'graphlens_saved_views';

function randomViewId() {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `view:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function safeJsonArray(str) {
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function safeJsonObject(str) {
  try {
    const parsed = JSON.parse(str);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
}

/**
 * The one visible node with no expansion-parent link - the node a live
 * exploration session started from via setInitialNode. Throws if there
 * isn't exactly one (an empty graph, or one built via Import/the graph
 * query panel's "Load onto canvas", which can start from several nodes
 * at once and so has no single node this schema's `initial_node_id`
 * column could name).
 */
export function findSingleRootNodeId(state) {
  const roots = Object.keys(state.visibleNodes).filter(
    (id) => !(state.expansionParents[id] && state.expansionParents[id].length > 0),
  );
  if (roots.length === 0) {
    throw new GraphLensValidationError('There is no graph to save yet - search for something first.', 'root');
  }
  if (roots.length > 1) {
    throw new GraphLensValidationError(
      'Saved views only work for a graph that started from a single search result. This graph has more than one starting point (e.g. from Import or a graph query\'s "Load onto canvas"), so it cannot be saved this way.',
      'root',
    );
  }
  return roots[0];
}

/** Builds the plain KV Store record body for the current graph state - pure, no network call. */
export function encodeSavedView({ state, viewName, description }) {
  if (typeof viewName !== 'string' || viewName.trim().length === 0) {
    throw new GraphLensValidationError('Give this view a name.', 'view_name');
  }
  const rootId = findSingleRootNodeId(state);
  const now = Date.now() / 1000;
  const filters = state.activeFilters || {};
  return {
    view_name: sanitizeForExportCell(viewName.trim(), { maxLength: 100 }),
    description: sanitizeForExportCell(description || '', { maxLength: 500 }),
    owner: getCurrentUsername(),
    sharing: 'private',
    time_earliest: filters.timeEarliest || '',
    time_latest: filters.timeLatest || '',
    initial_node_id: rootId,
    expanded_node_ids: JSON.stringify(state.expandedNodeIds || []),
    pinned_node_ids: JSON.stringify(state.pinnedNodeIds || []),
    node_filters: JSON.stringify({
      hiddenNodeTypes: state.hiddenNodeTypes || [],
      riskMin: filters.riskMin,
      riskMax: filters.riskMax,
      minEventCount: filters.minEventCount,
    }),
    relationship_filters: JSON.stringify({ hiddenRelationshipTypes: state.hiddenRelationshipTypes || [] }),
    layout: state.currentLayout || '',
    graph_limits: JSON.stringify(state.graphLimits || {}),
    created_time: now,
    modified_time: now,
  };
}

/** The inverse of encodeSavedView, applied defensively - nothing read back from storage is trusted any more than a live search result would be (see splSafety.js). A field that fails to parse simply comes back empty rather than failing the whole view. */
export function decodeSavedView(record) {
  return {
    viewId: record._key || record.view_id,
    viewName: typeof record.view_name === 'string' ? record.view_name : '',
    description: typeof record.description === 'string' ? record.description : '',
    owner: record.owner,
    timeEarliest: record.time_earliest || undefined,
    timeLatest: record.time_latest || undefined,
    initialNodeId: record.initial_node_id,
    expandedNodeIds: safeJsonArray(record.expanded_node_ids),
    pinnedNodeIds: safeJsonArray(record.pinned_node_ids),
    nodeFilters: safeJsonObject(record.node_filters),
    relationshipFilters: safeJsonObject(record.relationship_filters),
    layout: typeof record.layout === 'string' && record.layout ? record.layout : undefined,
    createdTime: record.created_time,
    modifiedTime: record.modified_time,
  };
}

/** Lists the current user's own saved views, most recently modified first. */
export async function listSavedViews({ fetchImpl } = {}) {
  const owner = getCurrentUsername();
  const records = await queryCollection(COLLECTION, { query: { owner }, sort: '-modified_time', limit: 200, fetchImpl });
  return (records || []).map(decodeSavedView);
}

/** Saves the current graph as a new named view (always a new record - saving again under the same name creates a second entry rather than overwriting the first). */
export async function saveView({ state, viewName, description }, { fetchImpl } = {}) {
  const record = encodeSavedView({ state, viewName, description });
  const viewId = randomViewId();
  record.view_id = viewId;
  record._key = viewId;
  await insertRecord(COLLECTION, record, { fetchImpl });
  return decodeSavedView(record);
}

export async function deleteSavedView(viewId, { fetchImpl } = {}) {
  await deleteRecord(COLLECTION, viewId, { fetchImpl });
}
