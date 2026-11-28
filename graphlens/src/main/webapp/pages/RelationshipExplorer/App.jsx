import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import { useGraphState } from '../../shared/hooks/useGraphState';
import { dispatchAdHocSearch, attachToJob, toUserFacingError } from '../../shared/services/searchService';
import { transformRowsToGraph, sanitizeNodeEdit, sanitizeEdgeEdit } from '../../shared/services/graphTransformer';
import { classifyJobResultRows } from '../../shared/services/jobResultsService';
import { getSettings, relationshipSourceFromSettings } from '../../shared/services/configService';
import { loadNodeTypeConfig, loadRelationshipTypeConfig, deriveNodeTypeList, deriveRelationshipTypeList } from '../../shared/services/typeConfigService';
import { recordAuditEvent, AUDIT_ACTIONS } from '../../shared/services/auditService';
import { hasCapability, CAPABILITIES } from '../../shared/services/capabilityService';
import { findShortestPath } from '../../shared/services/pathFinder';
import { buildExportBlob } from '../../shared/services/exportService';
import { parseImportedGraphJson, parseImportedGraphCsv, parseCsvRowObjects } from '../../shared/services/importService';
import { buildEvidenceTokensForEdge, buildEvidenceTokensForNode } from '../../shared/services/evidenceQueryBuilder';
import { buildInitialEntitySearchSpl, buildExpandNodeSpl, buildEvidenceSpl } from '../../shared/services/splTemplates';
import { parseGraphQuery } from '../../shared/services/graphQueryLanguage';
import { executeGraphQuery } from '../../shared/services/graphQueryExecutor';
import { listSavedViews, saveView, deleteSavedView } from '../../shared/services/savedViewsService';
import { setInitialNode as replaySetInitialNode, mergeExpansion as replayMergeExpansion } from '../../shared/services/graphStateReducer';
import { sanitizeSearchTerm, isValidId, GraphLensValidationError } from '../../shared/utilities/splSafety';

import GraphToolbar from './components/GraphToolbar';
import GraphCanvas, { fitGraph, centerOnNode, selectNodesByType, fitElements } from './components/GraphCanvas';
import NodeTypeFilter from './components/NodeTypeFilter';
import RelationshipTypeFilter from './components/RelationshipTypeFilter';
import RiskFilter from './components/RiskFilter';
import TimeSlicer from './components/TimeSlicer';
import StyleOverridesPanel from './components/StyleOverridesPanel';
import GraphLegend from './components/GraphLegend';
import GraphLimitBanner from './components/GraphLimitBanner';
import GraphTableView from './components/GraphTableView';
import NodeDetailsPanel from './components/NodeDetailsPanel';
import EdgeDetailsPanel from './components/EdgeDetailsPanel';
import BulkActionsPanel from './components/BulkActionsPanel';
import EvidencePanel from './components/EvidencePanel';
import PathFinderPanel from './components/PathFinderPanel';
import GraphQueryPanel from './components/GraphQueryPanel';
import SavedViewsPanel from './components/SavedViewsPanel';
import ExportDialog from './components/ExportDialog';
import LoadFromJobDialog from './components/LoadFromJobDialog';
import CsvImportPreviewDialog from './components/CsvImportPreviewDialog';
import ConfirmDialog from './components/ConfirmDialog';
import ErrorNotification from './components/ErrorNotification';
import EditUndoNotification from './components/EditUndoNotification';
import EmptyState from './components/EmptyState';
import SidebarSection from './components/SidebarSection';
import HiddenNodesPanel from './components/HiddenNodesPanel';
import PathStatusChip from './components/PathStatusChip';
import PageNav from '../../shared/components/PageNav';

const APP_VERSION = '1.25.0';

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Which left-sidebar sections start open (1.23.0). The filters and the
// legend are what most sessions use; the rest start collapsed so the
// sidebar no longer opens as one long scroll. A viewer's own toggles are
// remembered in this browser (localStorage - a per-viewer convenience
// only; it falls back to these defaults whenever storage is unavailable).
const DEFAULT_OPEN_SECTIONS = {
  nodeTypes: true,
  relationshipTypes: true,
  hiddenNodes: true,
  risk: true,
  timeWindow: true,
  legend: true,
  styleOverrides: false,
  pathFinder: false,
  query: false,
  savedViews: false,
};
const OPEN_SECTIONS_STORAGE_KEY = 'graphlens.sidebar.openSections';

function loadOpenSections() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(OPEN_SECTIONS_STORAGE_KEY) || 'null');
    if (stored && typeof stored === 'object') {
      const merged = { ...DEFAULT_OPEN_SECTIONS };
      Object.keys(DEFAULT_OPEN_SECTIONS).forEach((key) => {
        if (typeof stored[key] === 'boolean') merged[key] = stored[key];
      });
      return merged;
    }
  } catch (err) {
    // Storage blocked or corrupt - use the defaults.
  }
  return { ...DEFAULT_OPEN_SECTIONS };
}

function persistOpenSections(openSections) {
  try {
    window.localStorage.setItem(OPEN_SECTIONS_STORAGE_KEY, JSON.stringify(openSections));
  } catch (err) {
    // Not persisted - the toggle still applies for this page load.
  }
}

export default function App() {
  const [settings, setSettings] = useState(null);
  const [nodeTypeConfig, setNodeTypeConfig] = useState({});
  const [relationshipTypeConfig, setRelationshipTypeConfig] = useState({});
  const [error, setError] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [layoutToken, setLayoutToken] = useState(0);
  const [canvasViewMode, setCanvasViewMode] = useState('graph');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [loadFromJobDialogOpen, setLoadFromJobDialogOpen] = useState(false);
  const [loadFromJobState, setLoadFromJobState] = useState({ isLoading: false, error: null });
  const [canEditGraphData, setCanEditGraphData] = useState(false);
  const [csvPreviewState, setCsvPreviewState] = useState({ open: false, header: [], rows: [], fileName: null, error: null });
  const [confirmState, setConfirmState] = useState(null);
  // 1.25.0: the element that opened the current dialog, so focus can go
  // back to it when the dialog closes (it used to fall to <body>).
  const returnFocusRef = useRef(null);
  // 1.25.0: one-level undo for Hide (the reducer always had unhideNode,
  // but nothing in the UI called it - Reset graph was the only way back).
  const [lastHide, setLastHide] = useState(null);
  // 1.25.0: bumped by a search pick so focus can move to the details panel.
  const [focusDetailsToken, setFocusDetailsToken] = useState(0);
  // 1.25.0: Filters drawer at narrow widths (CSS shows the toggle <= 1100px).
  const [filtersDrawerOpen, setFiltersDrawerOpen] = useState(false);
  const detailsRef = useRef(null);
  const filtersRef = useRef(null);
  const [lastEdit, setLastEdit] = useState(null);
  const [openSections, setOpenSections] = useState(loadOpenSections);
  const toggleSection = useCallback((sectionId) => {
    setOpenSections((prev) => {
      const next = { ...prev, [sectionId]: !prev[sectionId] };
      persistOpenSections(next);
      return next;
    });
  }, []);
  const [hasSessionEdits, setHasSessionEdits] = useState(false);
  const [evidence, setEvidence] = useState({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
  const [pathEndpoints, setPathEndpoints] = useState({ startNodeId: null, endNodeId: null });
  const [path, setPath] = useState(null);
  const [queryState, setQueryState] = useState({ isRunning: false, error: null, result: null });
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState([]);
  const [sessionNodeColorOverrides, setSessionNodeColorOverrides] = useState({});
  const [sessionRelationshipColorOverrides, setSessionRelationshipColorOverrides] = useState({});
  const [savedViews, setSavedViews] = useState([]);
  const [savedViewsLoading, setSavedViewsLoading] = useState(false);
  const [savedViewsError, setSavedViewsError] = useState(null);
  const cyRef = useRef(null);
  const currentSearchRef = useRef(null);
  const importInputRef = useRef(null);

  const { state, actions, renderable, isNodeExpanded, isNodePinned } = useGraphState(
    settings
      ? {
        maxVisibleNodes: settings.maxVisibleNodes,
        maxVisibleEdges: settings.maxVisibleEdges,
        maxExpansionNeighbours: settings.maxExpansionNeighbours,
        maxExpansionDepth: settings.maxExpansionDepth,
        maxPathDepth: settings.maxPathDepth,
      }
      : undefined,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedSettings, nodeTypes, relTypes, canEdit] = await Promise.all([
        getSettings(),
        loadNodeTypeConfig(),
        loadRelationshipTypeConfig(),
        hasCapability(CAPABILITIES.EDIT_GRAPH_DATA),
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setNodeTypeConfig(nodeTypes);
      setRelationshipTypeConfig(relTypes);
      setCanEditGraphData(canEdit);
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshSavedViews = useCallback(async () => {
    setSavedViewsLoading(true);
    try {
      const views = await listSavedViews();
      setSavedViews(views);
    } catch (err) {
      setSavedViewsError(toUserFacingError(err));
    } finally {
      setSavedViewsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (settings && settings.enableSavedViews) {
      refreshSavedViews();
    }
    // refreshSavedViews is stable (empty dep list) - only settings becoming
    // available (or the feature being turned on) should trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings && settings.enableSavedViews]);

  const timeRange = { earliest: state.activeFilters.timeEarliest, latest: state.activeFilters.timeLatest };

  const selectedNode = state.selectedNodeId ? state.visibleNodes[state.selectedNodeId] : null;
  const selectedEdge = state.selectedEdgeId ? state.visibleEdges[state.selectedEdgeId] : null;

  const nodeCount = Object.keys(state.visibleNodes).length;
  const edgeCount = Object.keys(state.visibleEdges).length;
  const limitReached = settings
    ? nodeCount >= settings.maxVisibleNodes || edgeCount >= settings.maxVisibleEdges
    : false;

  const rememberFocus = useCallback(() => {
    const el = document.activeElement;
    if (el && el !== document.body) returnFocusRef.current = el;
  }, []);

  const restoreFocus = useCallback(() => {
    const el = returnFocusRef.current;
    returnFocusRef.current = null;
    if (el && document.body.contains(el)) window.setTimeout(() => el.focus(), 0);
  }, []);

  // Guards Reset graph / Import / Load from job (1.21.0) - each one
  // replaces the whole canvas with no way back, and since 1.19.0 that
  // can silently discard an on-canvas edit (itself session-only, so
  // there is nothing to re-export if the user did not think to first).
  // An empty canvas has nothing to lose, so `action` runs immediately
  // in that case rather than interrupting an already-empty workflow
  // with a pointless confirmation.
  const confirmBeforeDiscard = useCallback((shouldConfirm, action, { title, message, confirmLabel }) => {
    if (!shouldConfirm) {
      action();
      return;
    }
    if (!returnFocusRef.current) rememberFocus();
    setConfirmState({
      title,
      message,
      confirmLabel,
      onConfirm: () => {
        setConfirmState(null);
        action();
      },
    });
  }, [rememberFocus]);

  const confirmIfGraphHasContent = useCallback(
    (action, opts) => confirmBeforeDiscard(nodeCount > 0, action, opts),
    [confirmBeforeDiscard, nodeCount],
  );

  // Picking a search result, loading a query result onto the canvas and
  // loading a saved view also replace the whole graph (1.22.0), but they
  // are the normal way to move through an investigation - confirming on
  // every one would be noise. They only ask when this graph actually
  // holds an on-canvas edit that would be lost.
  const confirmIfSessionEdits = useCallback(
    (action) => confirmBeforeDiscard(hasSessionEdits, action, {
      title: 'Discard your edits?',
      message: 'This replaces the current graph, including the node/relationship edits you made in it. Edits are never saved anywhere - export first if you want to keep them.',
      confirmLabel: 'Discard edits',
    }),
    [confirmBeforeDiscard, hasSessionEdits],
  );

  // Every action that replaces the whole graph calls this, so a pending
  // Undo can never be applied to an unrelated node in the next graph that
  // happens to reuse the same id.
  const discardEditState = useCallback(() => {
    setLastEdit(null);
    setHasSessionEdits(false);
    setLastHide(null);
  }, []);


  const rawNodeTypeList = useMemo(() => deriveNodeTypeList(Object.values(state.visibleNodes), nodeTypeConfig), [state.visibleNodes, nodeTypeConfig]);
  const rawRelationshipTypeList = useMemo(() => deriveRelationshipTypeList(Object.values(state.visibleEdges), relationshipTypeConfig), [state.visibleEdges, relationshipTypeConfig]);

  // Session-only colour overrides (StyleOverridesPanel) - never persisted,
  // never sent anywhere, gone on reload. Applied here, before anything
  // else reads a type's colour, so the legend/filter swatches and the
  // canvas itself stay in agreement the same way they already have to
  // agree on the curated KV Store colour (see the comment below).
  const nodeTypeList = useMemo(
    () => rawNodeTypeList.map((nt) => (sessionNodeColorOverrides[nt.node_type] ? { ...nt, color: sessionNodeColorOverrides[nt.node_type] } : nt)),
    [rawNodeTypeList, sessionNodeColorOverrides],
  );
  const relationshipTypeList = useMemo(
    () => rawRelationshipTypeList.map((rt) => (sessionRelationshipColorOverrides[rt.relationship_type] ? { ...rt, color: sessionRelationshipColorOverrides[rt.relationship_type] } : rt)),
    [rawRelationshipTypeList, sessionRelationshipColorOverrides],
  );

  // The legend/filter swatches above and the canvas itself must always
  // agree on "what colour is this type" - confirmed live that they did
  // not: with no curated KV Store config, every node rendered the single
  // flat default colour on canvas regardless of type (graphTransformer
  // only sets a node/edge's own `color` field from curated config, never
  // from the colorForType fallback the legend already used), while the
  // legend showed per-type colours it was never actually rendering. These
  // maps are the single source of truth for both; see nodes/edges below.
  const nodeColorByType = useMemo(() => Object.fromEntries(nodeTypeList.map((nt) => [nt.node_type, nt.color])), [nodeTypeList]);
  // 1.24.0: the shape is resolved alongside the colour (configured, or an
  // automatic one per type) so the canvas and the legend agree on it too.
  const nodeShapeByType = useMemo(() => Object.fromEntries(nodeTypeList.map((nt) => [nt.node_type, nt.shape])), [nodeTypeList]);
  const relationshipColorByType = useMemo(() => Object.fromEntries(relationshipTypeList.map((rt) => [rt.relationship_type, rt.color])), [relationshipTypeList]);

  // Stable basis for the time slicer's own min/max bounds: the full
  // visible set, not the already-filtered renderable one, so the slider's
  // range does not shift around as other filters (type/risk) hide things.
  const timeBounds = useMemo(() => {
    let min = null;
    let max = null;
    const widen = (value) => {
      if (!value) return;
      const ms = Date.parse(value);
      if (!Number.isFinite(ms)) return;
      if (min === null || ms < min) min = ms;
      if (max === null || ms > max) max = ms;
    };
    Object.values(state.visibleNodes).forEach((n) => { widen(n.firstSeen); widen(n.lastSeen); });
    Object.values(state.visibleEdges).forEach((e) => { widen(e.firstSeen); widen(e.lastSeen); });
    return { min, max };
  }, [state.visibleNodes, state.visibleEdges]);

  const handleApiError = useCallback((err) => {
    const normalized = toUserFacingError(err);
    setError(normalized);
    return normalized;
  }, []);

  const handleSearch = useCallback(async (rawTerm) => {
    if (!settings) return;
    setIsSearching(true);
    setError(null);
    try {
      const { splSafe } = sanitizeSearchTerm(rawTerm);
      const spl = buildInitialEntitySearchSpl(splSafe, 20, relationshipSourceFromSettings(settings));
      const job = dispatchAdHocSearch(
        spl,
        { earliest: timeRange.earliest, latest: timeRange.latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 },
      );
      currentSearchRef.current = job;
      const { rows } = await job.waitForResults({ count: 20 });
      const { nodes } = transformRowsToGraph(rows, [], { maxNodes: 100, nodeTypeConfig });
      setSearchResults(nodes.map((n) => n.data));
      recordAuditEvent(AUDIT_ACTIONS.SEARCH, { detail: 'initial entity search' });
    } catch (err) {
      handleApiError(err);
      recordAuditEvent(AUDIT_ACTIONS.SEARCH, { outcome: 'failure', detail: String(err && err.code) });
    } finally {
      setIsSearching(false);
    }
  }, [settings, timeRange.earliest, timeRange.latest, nodeTypeConfig, handleApiError]);

  const handlePickResult = useCallback((result) => {
    actions.setInitialNode(result);
    setSearchResults([]);
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
    discardEditState();
    setLayoutToken((t) => t + 1);
    setFocusDetailsToken((t) => t + 1);
  }, [actions, discardEditState]);

  const requestPickResult = useCallback(
    (result) => confirmIfSessionEdits(() => handlePickResult(result)),
    [confirmIfSessionEdits, handlePickResult],
  );

  const handleExpandNode = useCallback(async (nodeId) => {
    if (!settings || !isValidId(nodeId)) return;
    if (isNodeExpanded(nodeId)) {
      actions.selectNode(nodeId);
      return;
    }
    setError(null);
    try {
      const spl = buildExpandNodeSpl(nodeId, settings.maxExpansionNeighbours, relationshipSourceFromSettings(settings));
      const job = dispatchAdHocSearch(
        spl,
        { earliest: timeRange.earliest, latest: timeRange.latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 },
      );
      const { rows } = await job.waitForResults({ count: settings.maxSearchResultRows });
      const { nodes, edges } = transformRowsToGraph([], rows, {
        maxNodes: settings.maxVisibleNodes,
        maxEdges: settings.maxVisibleEdges,
        nodeTypeConfig,
        relationshipTypeConfig,
      });
      actions.mergeExpansion(nodeId, { nodes, edges }, settings);
      setLayoutToken((t) => t + 1);
      recordAuditEvent(AUDIT_ACTIONS.EXPAND_NODE, { nodeId });
    } catch (err) {
      handleApiError(err);
      recordAuditEvent(AUDIT_ACTIONS.EXPAND_NODE, { nodeId, outcome: 'failure', detail: String(err && err.code) });
    }
  }, [settings, isNodeExpanded, actions, timeRange.earliest, timeRange.latest, nodeTypeConfig, relationshipTypeConfig, handleApiError]);

  const handleCollapseNode = useCallback((nodeId) => {
    actions.collapseNode(nodeId);
    recordAuditEvent(AUDIT_ACTIONS.COLLAPSE_NODE, { nodeId });
  }, [actions]);

  const handleCanvasViewModeChange = useCallback((mode) => {
    setCanvasViewMode(mode);
    // Switching away from Graph unmounts GraphCanvas (see render below),
    // which destroys its Cytoscape instance - clear the ref so every
    // cyRef.current-dependent action (legend click-to-select, Fit to
    // screen, PNG export, ...) sees "no canvas" rather than a stale handle
    // to an instance that no longer exists.
    if (mode !== 'graph') cyRef.current = null;
  }, []);

  const handleSelectNodeType = useCallback((nodeType) => {
    selectNodesByType(cyRef.current, nodeType);
  }, []);

  const handleSetNodeColorOverride = useCallback((nodeType, color) => {
    setSessionNodeColorOverrides((prev) => ({ ...prev, [nodeType]: color }));
  }, []);

  const handleClearNodeColorOverride = useCallback((nodeType) => {
    setSessionNodeColorOverrides((prev) => {
      const next = { ...prev };
      delete next[nodeType];
      return next;
    });
  }, []);

  const handleSetRelationshipColorOverride = useCallback((relationshipType, color) => {
    setSessionRelationshipColorOverrides((prev) => ({ ...prev, [relationshipType]: color }));
  }, []);

  const handleClearRelationshipColorOverride = useCallback((relationshipType) => {
    setSessionRelationshipColorOverrides((prev) => {
      const next = { ...prev };
      delete next[relationshipType];
      return next;
    });
  }, []);

  const handleBulkClear = useCallback(() => {
    if (cyRef.current) cyRef.current.nodes().unselect();
    setMultiSelectedNodeIds([]);
  }, []);

  const handleBulkPin = useCallback(() => {
    multiSelectedNodeIds.forEach((id) => actions.pinNode(id));
  }, [multiSelectedNodeIds, actions]);

  const handleBulkUnpin = useCallback(() => {
    multiSelectedNodeIds.forEach((id) => actions.unpinNode(id));
  }, [multiSelectedNodeIds, actions]);

  // 1.25.0: Hide is undoable (banner) and recoverable (Hidden nodes list),
  // and hiding the selected node clears the selection - the details panel
  // used to keep showing a node that was no longer on the graph.
  const handleHideNode = useCallback((nodeId) => {
    const node = state.visibleNodes[nodeId];
    actions.hideNode(nodeId);
    if (state.selectedNodeId === nodeId) actions.clearSelection();
    setLastHide({ ids: [nodeId], label: node ? node.label : nodeId });
  }, [actions, state.visibleNodes, state.selectedNodeId]);

  const handleUndoHide = useCallback(() => {
    if (!lastHide) return;
    lastHide.ids.forEach((id) => actions.unhideNode(id));
    setLastHide(null);
  }, [lastHide, actions]);

  const handleShowHiddenNode = useCallback((nodeId) => {
    actions.unhideNode(nodeId);
    setLastHide((prev) => (prev && prev.ids.includes(nodeId) ? null : prev));
  }, [actions]);

  const handleShowAllHidden = useCallback(() => {
    state.hiddenNodeIds.forEach((id) => actions.unhideNode(id));
    setLastHide(null);
  }, [actions, state.hiddenNodeIds]);

  const handleBulkHide = useCallback(() => {
    multiSelectedNodeIds.forEach((id) => actions.hideNode(id));
    setLastHide({ ids: [...multiSelectedNodeIds], label: `${multiSelectedNodeIds.length} nodes` });
    // The hidden nodes are about to be removed from the canvas entirely
    // (selectRenderableElements filters them out), so their selection no
    // longer means anything - clear it rather than leave the bulk panel
    // pointing at nodes that are no longer there.
    handleBulkClear();
  }, [multiSelectedNodeIds, actions, handleBulkClear]);

  const handleBulkExpand = useCallback(async () => {
    // Sequential, mirroring one-at-a-time manual expansion, rather than
    // firing every selected node's search concurrently.
    for (const id of multiSelectedNodeIds) {
      // eslint-disable-next-line no-await-in-loop
      await handleExpandNode(id);
    }
  }, [multiSelectedNodeIds, handleExpandNode]);

  const handleViewEvidence = useCallback(async (targetId, kind) => {
    if (!settings) return;
    const target = kind === 'node' ? state.visibleNodes[targetId] : state.visibleEdges[targetId];
    if (!target) return;
    setEvidence({ isLoading: true, error: null, rows: [], fieldOrder: [], targetLabel: kind === 'node' ? target.label : target.relationshipLabel });
    try {
      const tokens = kind === 'node'
        ? buildEvidenceTokensForNode(target, { evidenceDefaultIndex: settings.evidenceDefaultIndex })
        : buildEvidenceTokensForEdge(target, { evidenceDefaultIndex: settings.evidenceDefaultIndex });
      if (!tokens) {
        setEvidence((prev) => ({ ...prev, isLoading: false, rows: [], fieldOrder: [] }));
        return;
      }
      const spl = buildEvidenceSpl(tokens, 100);
      setEvidence((prev) => ({ ...prev, spl }));
      const job = dispatchAdHocSearch(
        spl,
        { earliest: timeRange.earliest, latest: timeRange.latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 },
      );
      const { rows, fieldOrder } = await job.waitForResults({ count: 100 });
      setEvidence({ isLoading: false, error: null, rows, fieldOrder, targetLabel: kind === 'node' ? target.label : target.relationshipLabel, spl });
      recordAuditEvent(AUDIT_ACTIONS.VIEW_EVIDENCE, kind === 'node' ? { nodeId: targetId } : { edgeId: targetId });
    } catch (err) {
      const normalized = toUserFacingError(err);
      setEvidence((prev) => ({ ...prev, isLoading: false, error: normalized }));
    }
  }, [settings, state.visibleNodes, state.visibleEdges, timeRange.earliest, timeRange.latest]);

  // 1.25.0: explicit "Path from here" / "Path to here" replace "Use as
  // path endpoint" (which set the start once, then the end every time
  // after, without saying which). As soon as both ends are set the path
  // is searched - see the effect below - and PathStatusChip reports it on
  // the canvas, so nobody has to scroll the sidebar to a Find button.
  // 1.25.0: "Open in Splunk Search" (EvidencePanel always supported it;
  // it was never wired up). Opens the same evidence search - built only
  // from validated tokens by buildEvidenceSpl - in the Search app, with the
  // same time range, in a new tab.
  const handleOpenEvidenceInSearch = useCallback(() => {
    if (!evidence.spl) return;
    const url = new URL('../search/search', window.location.href);
    url.searchParams.set('q', evidence.spl);
    url.searchParams.set('earliest', timeRange.earliest);
    url.searchParams.set('latest', timeRange.latest);
    window.open(url.toString(), '_blank', 'noopener');
  }, [evidence.spl, timeRange.earliest, timeRange.latest]);

  const handleSetPathStart = useCallback((nodeId) => {
    setPathEndpoints((prev) => ({ ...prev, startNodeId: nodeId }));
  }, []);

  const handleSetPathEnd = useCallback((nodeId) => {
    setPathEndpoints((prev) => ({ ...prev, endNodeId: nodeId }));
  }, []);

  const handleFindPath = useCallback(() => {
    if (!pathEndpoints.startNodeId || !pathEndpoints.endNodeId) return null;
    const maxDepth = settings ? settings.maxPathDepth : 5;
    const result = findShortestPath(renderable.nodes, renderable.edges, pathEndpoints.startNodeId, pathEndpoints.endNodeId, maxDepth);
    setPath(result);
    return result;
  }, [pathEndpoints, renderable.nodes, renderable.edges, settings]);

  const handleClearPath = useCallback(() => {
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
  }, []);

  // Runs the path search whenever both ends are (re)set, from the canvas
  // menu, the details panel or the Path finder dropdowns alike. Keyed on
  // the endpoints only - filtering the graph afterwards doesn't re-run it.
  const [pathSearched, setPathSearched] = useState(false);
  useEffect(() => {
    if (!pathEndpoints.startNodeId || !pathEndpoints.endNodeId) {
      setPathSearched(false);
      return;
    }
    const found = handleFindPath();
    setPathSearched(true);
    // Bring the whole path into view, clear of the status chip.
    if (found) fitElements(cyRef.current, [...found.nodeIds, ...found.edgeIds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathEndpoints.startNodeId, pathEndpoints.endNodeId]);

  const handleReset = useCallback(() => {
    actions.reset();
    setSearchResults([]);
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
    setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
    setQueryState({ isRunning: false, error: null, result: null });
    setMultiSelectedNodeIds([]);
    setSavedViewsError(null);
    setError(null);
    discardEditState();
    setLayoutToken((t) => t + 1);
  }, [actions, discardEditState]);

  const requestReset = useCallback(() => {
    confirmIfGraphHasContent(handleReset, {
      title: 'Reset graph?',
      message: `This clears the current graph (${nodeCount} node${nodeCount === 1 ? '' : 's'}) and can't be undone.`,
      confirmLabel: 'Reset graph',
    });
  }, [confirmIfGraphHasContent, handleReset, nodeCount]);

  const handleExport = useCallback((format) => {
    setExportDialogOpen(false);
    try {
      if (format === 'png') {
        if (!cyRef.current) return;
        const dataUrl = cyRef.current.png({ full: true, scale: 2, bg: '#ffffff' });
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'graphlens-export.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const blob = buildExportBlob(format, state, { appVersion: APP_VERSION });
        const extension = format === 'json' ? 'json' : 'csv';
        downloadBlob(blob, `graphlens-export.${extension}`);
      }
      recordAuditEvent(AUDIT_ACTIONS.EXPORT_GRAPH, { detail: format });
    } catch (err) {
      handleApiError(err);
    }
  }, [state, handleApiError]);

  // Shared tail end of "replace the whole graph with these rows" for
  // both of Import's accepted shapes (JSON, and CSV - edited or not) -
  // transform, load, reset the stale search/path/evidence state the
  // replaced graph can no longer honour, and audit. `formatLabel` is
  // only ever the audit detail's free text. Load from job
  // (handleLoadFromJob below) does the same sequence inline rather than
  // sharing this helper, since it also needs a droppedCount/sid in its
  // own audit detail and its own loading-state bookkeeping.
  const loadRowsOntoCanvas = useCallback((nodeRows, edgeRows, formatLabel) => {
    const { nodes, edges } = transformRowsToGraph(nodeRows, edgeRows, {
      maxNodes: settings.maxVisibleNodes,
      maxEdges: settings.maxVisibleEdges,
      nodeTypeConfig,
      relationshipTypeConfig,
    });
    actions.loadSnapshot({ nodes, edges }, settings);
    setSearchResults([]);
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
    setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
    discardEditState();
    setLayoutToken((t) => t + 1);
    recordAuditEvent(AUDIT_ACTIONS.IMPORT_GRAPH, { detail: `${nodes.length} nodes, ${edges.length} edges (${formatLabel})` });
  }, [settings, actions, nodeTypeConfig, relationshipTypeConfig, discardEditState]);

  const handleImportFile = useCallback((file) => {
    if (!settings || !file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        // A CSV file is identified by extension first; a file with
        // neither a .json nor a .csv extension (e.g. renamed, or
        // dragged in some other way) falls back to content sniffing -
        // GraphLens's own JSON export always starts with "{", which a
        // relationship-schema CSV's header row never does.
        const lowerName = (file.name || '').toLowerCase();
        const isCsv = lowerName.endsWith('.csv')
          || (!lowerName.endsWith('.json') && !text.trimStart().startsWith('{'));
        // A user with graphlens_edit_graph_data gets a chance to fix
        // the CSV's own cells (typo'd risk score, wrong label, ...)
        // before anything is classified or loaded onto the canvas - see
        // CsvImportPreviewDialog.jsx. Without that capability, CSV
        // import behaves exactly as it did in 1.18.0: straight to the
        // canvas, same as JSON import always has.
        if (isCsv && canEditGraphData) {
          const { header, rows } = parseCsvRowObjects(text);
          setCsvPreviewState({ open: true, header, rows, fileName: file.name, error: null });
          return;
        }
        const { nodeRows, edgeRows } = isCsv ? parseImportedGraphCsv(text) : parseImportedGraphJson(text);
        loadRowsOntoCanvas(nodeRows, edgeRows, isCsv ? 'csv' : 'json');
      } catch (err) {
        const message = err instanceof GraphLensValidationError ? err.message : 'Could not read that file.';
        setError({ code: 'import_error', message, retryable: false });
        recordAuditEvent(AUDIT_ACTIONS.IMPORT_GRAPH, { outcome: 'failure', detail: message });
      }
    };
    reader.onerror = () => {
      setError({ code: 'import_error', message: 'Could not read that file.', retryable: false });
      recordAuditEvent(AUDIT_ACTIONS.IMPORT_GRAPH, { outcome: 'failure', detail: 'file read error' });
    };
    reader.readAsText(file);
  }, [settings, canEditGraphData, loadRowsOntoCanvas]);

  // Gates the file picker itself, not handleImportFile above, so the
  // same confirmation guards both of Import's accepted shapes (JSON and
  // CSV) and both of CSV's two paths (direct load, or the preview
  // dialog) in one place, rather than threading it through each.
  const requestImport = useCallback(() => {
    confirmIfGraphHasContent(
      () => importInputRef.current && importInputRef.current.click(),
      {
        title: 'Import graph?',
        message: `This replaces the current graph (${nodeCount} node${nodeCount === 1 ? '' : 's'}). Pick a file to continue, or Cancel to keep what's on screen.`,
        confirmLabel: 'Choose file',
      },
    );
  }, [confirmIfGraphHasContent, nodeCount]);

  // CsvImportPreviewDialog's Load button: the rows may have been
  // hand-edited since parseCsvRowObjects first produced them, so they
  // are classified here, not when the dialog opened - classification
  // reuses jobResultsService.js's classifyJobResultRows, the exact same
  // function Load from job and the direct (no-edit) CSV import path
  // both already use, so an edited CSV import behaves identically to
  // either from this point on.
  const handleCsvPreviewLoad = useCallback((editedRows) => {
    const { nodeRows, edgeRows } = classifyJobResultRows(editedRows);
    if (nodeRows.length === 0 && edgeRows.length === 0) {
      setCsvPreviewState((s) => ({ ...s, error: "That CSV doesn't match the relationship schema - see the Help page." }));
      return;
    }
    loadRowsOntoCanvas(nodeRows, edgeRows, 'csv, reviewed');
    setCsvPreviewState({ open: false, header: [], rows: [], fileName: null, error: null });
  }, [loadRowsOntoCanvas]);

  const handleSaveNodeEdit = useCallback((nodeId, patch) => {
    const existing = state.visibleNodes[nodeId];
    if (!existing) return;
    const nextData = sanitizeNodeEdit(existing, patch, nodeTypeConfig);
    actions.updateNodeData(nodeId, nextData);
    // `existing` (the node's data as it was just before this edit) is
    // kept as the one-level "undo my last edit" snapshot - see
    // handleUndoLastEdit and EditUndoNotification.jsx (1.21.0).
    setLastEdit({ kind: 'node', id: nodeId, previousData: existing, label: existing.label });
    setHasSessionEdits(true);
    recordAuditEvent(AUDIT_ACTIONS.EDIT_NODE, { nodeId, detail: 'node properties edited' });
  }, [state.visibleNodes, nodeTypeConfig, actions]);

  const handleSaveEdgeEdit = useCallback((edgeId, patch) => {
    const existing = state.visibleEdges[edgeId];
    if (!existing) return;
    const nextData = sanitizeEdgeEdit(existing, patch, relationshipTypeConfig);
    actions.updateEdgeData(edgeId, nextData);
    setLastEdit({ kind: 'edge', id: edgeId, previousData: existing, label: existing.relationshipLabel });
    setHasSessionEdits(true);
    recordAuditEvent(AUDIT_ACTIONS.EDIT_EDGE, { edgeId, detail: 'relationship properties edited' });
  }, [state.visibleEdges, relationshipTypeConfig, actions]);

  // Restores the single snapshot handleSaveNodeEdit/handleSaveEdgeEdit
  // kept just before their own edit. A no-op (beyond clearing the
  // snapshot) if the node/edge is no longer visible - e.g. hidden or
  // collapsed away since the edit - since updateNodeData/updateEdgeData
  // themselves already guard against writing into a node/edge that no
  // longer exists; there is no second "undo" chance either way, by
  // design (see EditUndoNotification.jsx's doc comment).
  const handleUndoLastEdit = useCallback(() => {
    if (!lastEdit) return;
    if (lastEdit.kind === 'node') {
      actions.updateNodeData(lastEdit.id, lastEdit.previousData);
      recordAuditEvent(AUDIT_ACTIONS.EDIT_NODE, { nodeId: lastEdit.id, detail: 'edit undone' });
    } else {
      actions.updateEdgeData(lastEdit.id, lastEdit.previousData);
      recordAuditEvent(AUDIT_ACTIONS.EDIT_EDGE, { edgeId: lastEdit.id, detail: 'edit undone' });
    }
    setLastEdit(null);
  }, [lastEdit, actions]);

  // "Load from job": the one-time counterpart to handleImportFile above,
  // but reading an already-completed Splunk search job's results instead
  // of a previously-exported file - see LoadFromJobDialog.jsx and
  // searchService.js's attachToJob doc comment for why this is a
  // one-time action, not a persistent relationship data source the way
  // index/lookup/saved_search/dataset are.
  const handleLoadFromJob = useCallback(async (sid) => {
    if (!settings) return;
    setLoadFromJobState({ isLoading: true, error: null });
    try {
      const trimmedSid = sid.trim();
      if (!isValidId(trimmedSid)) {
        throw new GraphLensValidationError('That does not look like a valid job id.', 'sid');
      }
      const job = attachToJob(trimmedSid, { maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 });
      const { rows } = await job.waitForResults({ count: settings.maxSearchResultRows });
      const { nodeRows, edgeRows, droppedCount } = classifyJobResultRows(rows);
      if (nodeRows.length === 0 && edgeRows.length === 0) {
        throw new GraphLensValidationError("That job's results don't match the relationship schema - see the Help page.", 'sid');
      }
      const { nodes, edges } = transformRowsToGraph(nodeRows, edgeRows, {
        maxNodes: settings.maxVisibleNodes,
        maxEdges: settings.maxVisibleEdges,
        nodeTypeConfig,
        relationshipTypeConfig,
      });
      actions.loadSnapshot({ nodes, edges }, settings);
      setSearchResults([]);
      setPath(null);
      setPathEndpoints({ startNodeId: null, endNodeId: null });
      setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
      discardEditState();
      setLayoutToken((t) => t + 1);
      setLoadFromJobState({ isLoading: false, error: null });
      setLoadFromJobDialogOpen(false);
      recordAuditEvent(
        AUDIT_ACTIONS.LOAD_FROM_JOB,
        { detail: `${nodes.length} nodes, ${edges.length} edges from job ${trimmedSid}${droppedCount ? `, ${droppedCount} rows skipped` : ''}` },
      );
    } catch (err) {
      const message = err instanceof GraphLensValidationError ? err.message : toUserFacingError(err).message;
      setLoadFromJobState({ isLoading: false, error: message });
      recordAuditEvent(AUDIT_ACTIONS.LOAD_FROM_JOB, { outcome: 'failure', detail: message });
    }
  }, [settings, actions, nodeTypeConfig, relationshipTypeConfig, discardEditState]);

  const requestLoadFromJobOpen = useCallback(() => {
    confirmIfGraphHasContent(() => setLoadFromJobDialogOpen(true), {
      title: 'Load from job?',
      message: `This replaces the current graph (${nodeCount} node${nodeCount === 1 ? '' : 's'}).`,
      confirmLabel: 'Continue',
    });
  }, [confirmIfGraphHasContent, nodeCount]);

  const handleRunGraphQuery = useCallback(async (queryText) => {
    if (!settings) return;
    setQueryState({ isRunning: true, error: null, result: null });
    try {
      const ast = parseGraphQuery(queryText);
      // The executor never builds its own SPL text - it only dispatches the
      // same two pre-reviewed templates handleSearch/handleExpandNode above
      // already use, through this same dispatchAdHocSearch call shape.
      const dispatch = async (spl) => {
        const job = dispatchAdHocSearch(
          spl,
          { earliest: timeRange.earliest, latest: timeRange.latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 },
        );
        return job.waitForResults({ count: settings.maxSearchResultRows });
      };
      const result = await executeGraphQuery(ast, { settings, nodeTypeConfig, relationshipTypeConfig, dispatch });
      setQueryState({ isRunning: false, error: null, result });
      recordAuditEvent(AUDIT_ACTIONS.RUN_GRAPH_QUERY, { detail: `${result.nodes.length} nodes, ${result.edges.length} edges${result.diagnostics.truncated ? ' (truncated)' : ''}` });
    } catch (err) {
      // A GraphLensValidationError (a syntax error, or a rejected depth/
      // argument) carries a specific, user-actionable message - unlike
      // toUserFacingError's generic fallback for unrecognised error types,
      // which would otherwise mask exactly the detail someone fixing their
      // query needs. Mirrors handleImportFile's same distinction above.
      const message = err instanceof GraphLensValidationError ? err.message : toUserFacingError(err).message;
      setQueryState({ isRunning: false, error: { message }, result: null });
      recordAuditEvent(AUDIT_ACTIONS.RUN_GRAPH_QUERY, { outcome: 'failure', detail: String((err && err.code) || (err && err.name) || 'error') });
    }
  }, [settings, nodeTypeConfig, relationshipTypeConfig, timeRange.earliest, timeRange.latest]);

  const handleLoadQueryResultOntoCanvas = useCallback(() => {
    if (!settings || !queryState.result) return;
    actions.loadSnapshot({ nodes: queryState.result.nodes, edges: queryState.result.edges }, settings);
    setSearchResults([]);
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
    setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
    discardEditState();
    setLayoutToken((t) => t + 1);
  }, [settings, queryState.result, actions, discardEditState]);

  const requestLoadQueryResultOntoCanvas = useCallback(
    () => confirmIfSessionEdits(handleLoadQueryResultOntoCanvas),
    [confirmIfSessionEdits, handleLoadQueryResultOntoCanvas],
  );

  const handleSaveView = useCallback(async (name, description) => {
    setSavedViewsError(null);
    try {
      await saveView({ state, viewName: name, description });
      recordAuditEvent(AUDIT_ACTIONS.SAVE_VIEW, { detail: name });
      await refreshSavedViews();
    } catch (err) {
      const message = err instanceof GraphLensValidationError ? err.message : toUserFacingError(err).message;
      setSavedViewsError({ message });
      recordAuditEvent(AUDIT_ACTIONS.SAVE_VIEW, { outcome: 'failure', detail: String((err && err.code) || (err && err.name) || 'error') });
    }
  }, [state, refreshSavedViews]);

  const handleDeleteSavedView = useCallback(async (viewId) => {
    try {
      await deleteSavedView(viewId);
      recordAuditEvent(AUDIT_ACTIONS.DELETE_VIEW, {});
      await refreshSavedViews();
    } catch (err) {
      setSavedViewsError(toUserFacingError(err));
    }
  }, [refreshSavedViews]);

  const handleLoadSavedView = useCallback(async (view) => {
    if (!settings) return;
    setSavedViewsError(null);
    try {
      if (!isValidId(view.initialNodeId)) {
        throw new GraphLensValidationError("This view's starting node id is not valid.", 'initial_node_id');
      }
      const earliest = view.timeEarliest || settings.defaultEarliest;
      const latest = view.timeLatest || settings.defaultLatest;
      const source = relationshipSourceFromSettings(settings);
      const expansionLimit = settings.maxExpansionNeighbours;

      // The same buildExpandNodeSpl dispatch handleExpandNode already
      // uses, called once per node being restored - no new SPL shape.
      const dispatchExpand = async (nodeId) => {
        const spl = buildExpandNodeSpl(nodeId, expansionLimit, source);
        const job = dispatchAdHocSearch(spl, { earliest, latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 });
        const { rows } = await job.waitForResults({ count: settings.maxSearchResultRows });
        return transformRowsToGraph([], rows, {
          maxNodes: settings.maxVisibleNodes,
          maxEdges: settings.maxVisibleEdges,
          nodeTypeConfig,
          relationshipTypeConfig,
        });
      };

      const { nodes: rootNodes } = await dispatchExpand(view.initialNodeId);
      const rootMatch = rootNodes.find((n) => n.data.id === view.initialNodeId);
      if (!rootMatch) {
        throw new GraphLensValidationError("This view's starting node currently has no relationships and can't be reconstructed.", 'initial_node_id');
      }

      // Built entirely via pure composition of graphStateReducer's own
      // functions, committed in a single actions.replaceState at the end -
      // not via the React-level actions.setInitialNode/mergeExpansion in
      // a loop. Each step here needs the PREVIOUS step's node to already
      // be visible (mergeExpansion throws otherwise), which React's own
      // asynchronous, batched state updates cannot guarantee mid-loop;
      // composing the pure functions directly sidesteps that entirely.
      let nextState = replaySetInitialNode(state, rootMatch.data);
      for (const nodeId of view.expandedNodeIds) {
        if (!isValidId(nodeId) || !nextState.visibleNodes[nodeId] || nextState.expandedNodeIds.includes(nodeId)) continue;
        // eslint-disable-next-line no-await-in-loop
        const { nodes, edges } = await dispatchExpand(nodeId);
        const { nextState: merged } = replayMergeExpansion(nextState, nodeId, { nodes, edges }, settings);
        nextState = merged;
      }

      const validPinnedIds = (view.pinnedNodeIds || []).filter((id) => isValidId(id) && nextState.visibleNodes[id]);
      nextState = {
        ...nextState,
        pinnedNodeIds: validPinnedIds,
        hiddenNodeTypes: Array.isArray(view.nodeFilters.hiddenNodeTypes) ? view.nodeFilters.hiddenNodeTypes : [],
        hiddenRelationshipTypes: Array.isArray(view.relationshipFilters.hiddenRelationshipTypes) ? view.relationshipFilters.hiddenRelationshipTypes : [],
        activeFilters: {
          ...nextState.activeFilters,
          riskMin: Number.isFinite(view.nodeFilters.riskMin) ? view.nodeFilters.riskMin : nextState.activeFilters.riskMin,
          riskMax: Number.isFinite(view.nodeFilters.riskMax) ? view.nodeFilters.riskMax : nextState.activeFilters.riskMax,
          minEventCount: Number.isFinite(view.nodeFilters.minEventCount) ? view.nodeFilters.minEventCount : nextState.activeFilters.minEventCount,
          timeEarliest: earliest,
          timeLatest: latest,
        },
        currentLayout: view.layout || nextState.currentLayout,
      };

      actions.replaceState(nextState);
      setSearchResults([]);
      setPath(null);
      setPathEndpoints({ startNodeId: null, endNodeId: null });
      setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
      setMultiSelectedNodeIds([]);
      discardEditState();
      setLayoutToken((t) => t + 1);
      recordAuditEvent(AUDIT_ACTIONS.LOAD_VIEW, { detail: view.viewName });
    } catch (err) {
      const message = err instanceof GraphLensValidationError ? err.message : toUserFacingError(err).message;
      setSavedViewsError({ message });
      recordAuditEvent(AUDIT_ACTIONS.LOAD_VIEW, { outcome: 'failure', detail: String((err && err.code) || (err && err.name) || 'error') });
    }
  }, [settings, state, actions, nodeTypeConfig, relationshipTypeConfig, discardEditState]);

  // Asks before the saved view's searches even start, not after they
  // finish - a user who cancels should not have dispatched anything.
  const requestLoadSavedView = useCallback(
    (view) => confirmIfSessionEdits(() => handleLoadSavedView(view)),
    [confirmIfSessionEdits, handleLoadSavedView],
  );

  const handleTimeRangeChange = useCallback((preset) => {
    actions.setActiveFilters({ timeEarliest: preset.earliest, timeLatest: preset.latest });
  }, [actions]);

  const hasGraph = Object.keys(state.visibleNodes).length > 0;

  // 1.25.0: after a search pick, focus the details panel's first action
  // (Expand) - keyboard users used to land on <body>, 39 Tab presses away.
  useEffect(() => {
    if (!focusDetailsToken) return;
    window.setTimeout(() => {
      const root = detailsRef.current;
      if (!root) return;
      const target = root.querySelector('.graphlens-actions-stack button') || root;
      target.focus();
    }, 60);
  }, [focusDetailsToken]);

  // 1.25.0: when the last open dialog closes, return focus to whatever
  // opened it (Export, Reset graph, Import, Load from job).
  const anyDialogOpen = exportDialogOpen || loadFromJobDialogOpen || csvPreviewState.open || !!confirmState;
  const wasDialogOpenRef = useRef(false);
  useEffect(() => {
    if (wasDialogOpenRef.current && !anyDialogOpen) restoreFocus();
    wasDialogOpenRef.current = anyDialogOpen;
  }, [anyDialogOpen, restoreFocus]);

  // 1.25.0: narrow-width Filters drawer - Escape closes it and returns
  // focus to the toggle; opening it focuses its first control.
  useEffect(() => {
    if (!filtersDrawerOpen) return undefined;
    const root = filtersRef.current;
    window.setTimeout(() => {
      const first = root && root.querySelector('button, input, [tabindex="0"]');
      if (first) first.focus();
    }, 0);
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setFiltersDrawerOpen(false);
        const toggle = document.querySelector('.graphlens-filters-toggle');
        if (toggle) toggle.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [filtersDrawerOpen]);

  if (!settings) {
    return <div className="graphlens-app" aria-busy="true" />;
  }

  return (
    <div className={filtersDrawerOpen ? 'graphlens-app graphlens-filters-open' : 'graphlens-app'}>
      {/*
        1.25.0: skip links. The sidebar sits between the toolbar and the
        details panel in tab order (39 Tab presses from search to Expand).
      */}
      <nav className="graphlens-skip-links" aria-label="Skip links">
        <a href="#graphlens-details-region" className="graphlens-skip-link" onClick={(e) => { e.preventDefault(); if (detailsRef.current) detailsRef.current.focus(); }}>Skip to details</a>
        <a href="#graphlens-graph-region" className="graphlens-skip-link" onClick={(e) => { e.preventDefault(); const c = document.querySelector('.graphlens-canvas, .graphlens-canvas-table'); if (c) { if (!c.hasAttribute('tabindex')) c.setAttribute('tabindex', '-1'); c.focus(); } }}>Skip to graph</a>
      </nav>
      <div className="graphlens-pagenav">
        <PageNav activeTabId="graphlens_relationship_explorer" />
      </div>

      <GraphToolbar
        isSearching={isSearching}
        searchResults={searchResults}
        onSearch={handleSearch}
        onPickResult={requestPickResult}
        earliest={timeRange.earliest}
        latest={timeRange.latest}
        onTimeRangeChange={handleTimeRangeChange}
        viewMode={canvasViewMode}
        onViewModeChange={handleCanvasViewModeChange}
        layoutName={state.currentLayout}
        onLayoutChange={(name) => actions.setLayout(name)}
        onRecalculateLayout={() => setLayoutToken((t) => t + 1)}
        onFit={() => fitGraph(cyRef.current)}
        onCenterSelected={() => centerOnNode(cyRef.current, state.selectedNodeId)}
        onReset={() => { rememberFocus(); requestReset(); }}
        onExportOpen={() => { rememberFocus(); setExportDialogOpen(true); }}
        exportEnabled={settings.enableExport}
        onImportClick={() => { rememberFocus(); requestImport(); }}
        importEnabled={settings.enableExport}
        onLoadFromJobOpen={() => { rememberFocus(); requestLoadFromJobOpen(); }}
        loadFromJobEnabled={settings.enableExport}
        filtersDrawerOpen={filtersDrawerOpen}
        onToggleFiltersDrawer={() => setFiltersDrawerOpen((o) => !o)}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json,text/csv,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          handleImportFile(file);
          e.target.value = '';
        }}
      />

      <section id="graphlens-filters-region" className="graphlens-filters" ref={filtersRef} aria-label="Filters and tools">
        <button type="button" className="graphlens-filters-close" onClick={() => setFiltersDrawerOpen(false)}>Close filters</button>
        <ErrorNotification error={error} onDismiss={() => setError(null)} />
        <EditUndoNotification lastEdit={lastEdit} onUndo={handleUndoLastEdit} onDismiss={() => setLastEdit(null)} />
        <EditUndoNotification
          lastEdit={lastHide}
          message={lastHide ? `Hid "${lastHide.label}".` : ''}
          onUndo={handleUndoHide}
          onDismiss={() => setLastHide(null)}
        />
        <SidebarSection sectionId="nodeTypes" title="Node types" headingId="graphlens-node-type-filter-heading" open={openSections.nodeTypes} onToggle={toggleSection} badge={nodeTypeList.length || null}>
          <NodeTypeFilter nodeTypes={nodeTypeList} hiddenNodeTypes={state.hiddenNodeTypes} onChange={(types) => actions.setHiddenNodeTypes(types)} />
        </SidebarSection>
        <SidebarSection sectionId="relationshipTypes" title="Relationship types" headingId="graphlens-rel-type-filter-heading" open={openSections.relationshipTypes} onToggle={toggleSection} badge={relationshipTypeList.length || null}>
          <RelationshipTypeFilter relationshipTypes={relationshipTypeList} hiddenRelationshipTypes={state.hiddenRelationshipTypes} onChange={(types) => actions.setHiddenRelationshipTypes(types)} />
        </SidebarSection>
        {state.hiddenNodeIds.length > 0 && (
          <SidebarSection sectionId="hiddenNodes" title="Hidden nodes" headingId="graphlens-hidden-nodes-heading" open={openSections.hiddenNodes} onToggle={toggleSection} badge={state.hiddenNodeIds.length}>
            <HiddenNodesPanel
              nodes={state.hiddenNodeIds.map((id) => state.visibleNodes[id] || { id, label: id })}
              onShow={handleShowHiddenNode}
              onShowAll={handleShowAllHidden}
            />
          </SidebarSection>
        )}
        <SidebarSection sectionId="risk" title="Risk & frequency" headingId="graphlens-risk-filter-heading" open={openSections.risk} onToggle={toggleSection}>
          <RiskFilter
            riskMin={state.activeFilters.riskMin}
            riskMax={state.activeFilters.riskMax}
            minEventCount={state.activeFilters.minEventCount}
            onChange={(filters) => actions.setActiveFilters(filters)}
          />
        </SidebarSection>
        {settings.enableTimeSlicer && (
          <SidebarSection sectionId="timeWindow" title="Filter by activity time" headingId="graphlens-time-slicer-heading" open={openSections.timeWindow} onToggle={toggleSection}>
            <TimeSlicer
              minMs={timeBounds.min}
              maxMs={timeBounds.max}
              valueMin={state.activeFilters.timeFilterMin}
              valueMax={state.activeFilters.timeFilterMax}
              onChange={(filters) => actions.setActiveFilters(filters)}
            />
          </SidebarSection>
        )}
        <SidebarSection sectionId="legend" title="Legend" headingId="graphlens-legend-heading" open={openSections.legend} onToggle={toggleSection}>
          <GraphLegend nodeTypes={nodeTypeList} relationshipTypes={relationshipTypeList} onSelectNodeType={handleSelectNodeType} />
        </SidebarSection>
        {settings.enableStyleOverrides && (
          <SidebarSection sectionId="styleOverrides" title="Colours (this session only)" headingId="graphlens-style-overrides-heading" open={openSections.styleOverrides} onToggle={toggleSection}>
            <StyleOverridesPanel
              nodeTypes={nodeTypeList}
              relationshipTypes={relationshipTypeList}
              nodeOverrides={sessionNodeColorOverrides}
              relationshipOverrides={sessionRelationshipColorOverrides}
              onSetNodeColor={handleSetNodeColorOverride}
              onSetRelationshipColor={handleSetRelationshipColorOverride}
              onClearNodeColor={handleClearNodeColorOverride}
              onClearRelationshipColor={handleClearRelationshipColorOverride}
            />
          </SidebarSection>
        )}
        {settings.enablePathFinder && (
          <SidebarSection sectionId="pathFinder" title="Path finder (visible graph only)" headingId="graphlens-pathfinder-heading" open={openSections.pathFinder} onToggle={toggleSection}>
            <PathFinderPanel
              nodes={renderable.nodes}
              startNodeId={pathEndpoints.startNodeId}
              endNodeId={pathEndpoints.endNodeId}
              onSetStart={(id) => setPathEndpoints((prev) => ({ ...prev, startNodeId: id }))}
              onSetEnd={(id) => setPathEndpoints((prev) => ({ ...prev, endNodeId: id }))}
              onFindPath={handleFindPath}
              onClearPath={handleClearPath}
              path={path}
            />
          </SidebarSection>
        )}
        {settings.enableGraphQuery && (
          <SidebarSection sectionId="query" title="Query" headingId="graphlens-query-heading" open={openSections.query} onToggle={toggleSection}>
            <GraphQueryPanel
              isRunning={queryState.isRunning}
              error={queryState.error}
              result={queryState.result}
              onRunQuery={handleRunGraphQuery}
              onLoadOntoCanvas={requestLoadQueryResultOntoCanvas}
            />
          </SidebarSection>
        )}
        {settings.enableSavedViews && (
          <SidebarSection sectionId="savedViews" title="Saved views" headingId="graphlens-saved-views-heading" open={openSections.savedViews} onToggle={toggleSection} badge={savedViews.length || null}>
            <SavedViewsPanel
              views={savedViews}
              isLoading={savedViewsLoading}
              error={savedViewsError}
              onSave={handleSaveView}
              onLoad={requestLoadSavedView}
              onDelete={handleDeleteSavedView}
            />
          </SidebarSection>
        )}
      </section>

      <section id="graphlens-graph-region" className="graphlens-canvas-wrapper" aria-label="Graph">
        {!hasGraph && <EmptyState />}
        {canvasViewMode === 'graph' ? (
          <GraphCanvas
            nodes={renderable.nodes.map((n) => ({ data: { ...n, color: nodeColorByType[n.type] || n.color, shape: nodeShapeByType[n.type] || n.shape } }))}
            edges={renderable.edges.map((e) => ({ data: { ...e, color: relationshipColorByType[e.relationship] || e.color } }))}
            layoutName={state.currentLayout}
            layoutToken={layoutToken}
            pinnedNodeIds={state.pinnedNodeIds}
            expandedNodeIds={state.expandedNodeIds}
            highlightedPath={path}
            onSelectNode={(id) => actions.selectNode(id)}
            onSelectEdge={(id) => actions.selectEdge(id)}
            onClearSelection={() => actions.clearSelection()}
            selectedNodeId={state.selectedNodeId}
            selectedEdgeId={state.selectedEdgeId}
            onExpandNode={handleExpandNode}
            onCollapseNode={handleCollapseNode}
            onHideNode={handleHideNode}
            onPinNode={(id) => actions.pinNode(id)}
            onUnpinNode={(id) => actions.unpinNode(id)}
            onViewEvidence={handleViewEvidence}
            onSetPathStart={handleSetPathStart}
            onSetPathEnd={handleSetPathEnd}
            onMultiSelectNodes={setMultiSelectedNodeIds}
            onCyReady={(cy) => { cyRef.current = cy; }}
          />
        ) : (
          <GraphTableView
            nodes={renderable.nodes}
            edges={renderable.edges}
            selectedNodeId={state.selectedNodeId}
            selectedEdgeId={state.selectedEdgeId}
            onSelectNode={(id) => actions.selectNode(id)}
            onSelectEdge={(id) => actions.selectEdge(id)}
          />
        )}
        <PathStatusChip
          startLabel={pathEndpoints.startNodeId ? ((state.visibleNodes[pathEndpoints.startNodeId] || {}).label || pathEndpoints.startNodeId) : null}
          endLabel={pathEndpoints.endNodeId ? ((state.visibleNodes[pathEndpoints.endNodeId] || {}).label || pathEndpoints.endNodeId) : null}
          searched={pathSearched}
          path={path}
          maxDepth={settings.maxPathDepth}
          onClear={handleClearPath}
        />
        <GraphLimitBanner
          visible={limitReached}
          nodeCount={nodeCount}
          maxVisibleNodes={settings.maxVisibleNodes}
          edgeCount={edgeCount}
          maxVisibleEdges={settings.maxVisibleEdges}
        />
      </section>

      <section id="graphlens-details-region" className="graphlens-details" ref={detailsRef} tabIndex={-1} aria-label="Details">
        {multiSelectedNodeIds.length > 1 ? (
          <BulkActionsPanel
            count={multiSelectedNodeIds.length}
            onPinAll={handleBulkPin}
            onUnpinAll={handleBulkUnpin}
            onHideAll={handleBulkHide}
            onExpandAll={handleBulkExpand}
            onClear={handleBulkClear}
          />
        ) : (
          <>
            {selectedNode && (
              <NodeDetailsPanel
                node={selectedNode}
                isExpanded={isNodeExpanded(selectedNode.id)}
                isPinned={isNodePinned(selectedNode.id)}
                canEdit={canEditGraphData}
                onExpand={handleExpandNode}
                onCollapse={handleCollapseNode}
                onHide={handleHideNode}
                onPin={(id) => actions.pinNode(id)}
                onUnpin={(id) => actions.unpinNode(id)}
                onViewEvidence={handleViewEvidence}
                onSetPathStart={handleSetPathStart}
                onSetPathEnd={handleSetPathEnd}
                onSaveEdit={handleSaveNodeEdit}
              />
            )}
            {selectedEdge && (
              <EdgeDetailsPanel
                edge={selectedEdge}
                canEdit={canEditGraphData}
                onViewEvidence={handleViewEvidence}
                onSaveEdit={handleSaveEdgeEdit}
              />
            )}
            {!selectedNode && !selectedEdge && (
              <div className="graphlens-section">
                <h3>Details</h3>
                <p style={{ fontSize: 12, color: '#6b7378' }}>Select a node or relationship to see its properties and actions.</p>
              </div>
            )}
          </>
        )}
      </section>

      <section className="graphlens-evidence" aria-label="Supporting events">
        <EvidencePanel
          isLoading={evidence.isLoading}
          error={evidence.error}
          rows={evidence.rows}
          fieldOrder={evidence.fieldOrder}
          targetLabel={evidence.targetLabel}
          onOpenInSearch={evidence.spl ? handleOpenEvidenceInSearch : undefined}
          onClear={() => setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null })}
        />
      </section>

      <ExportDialog
        open={exportDialogOpen}
        allowedFormats={settings.allowedExportFormats.map((f) => (f === 'csv' ? ['csv-nodes', 'csv-edges'] : [f])).flat()}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
      />

      <LoadFromJobDialog
        open={loadFromJobDialogOpen}
        isLoading={loadFromJobState.isLoading}
        error={loadFromJobState.error}
        onClose={() => {
          setLoadFromJobDialogOpen(false);
          setLoadFromJobState({ isLoading: false, error: null });
        }}
        onLoad={handleLoadFromJob}
      />

      <CsvImportPreviewDialog
        open={csvPreviewState.open}
        header={csvPreviewState.header}
        rows={csvPreviewState.rows}
        fileName={csvPreviewState.fileName}
        error={csvPreviewState.error}
        onClose={() => setCsvPreviewState({ open: false, header: [], rows: [], fileName: null, error: null })}
        onLoad={handleCsvPreviewLoad}
      />

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState ? confirmState.title : ''}
        message={confirmState ? confirmState.message : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : 'Continue'}
        onConfirm={confirmState ? confirmState.onConfirm : undefined}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  );
}
