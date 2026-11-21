import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';

import { useGraphState } from '../../shared/hooks/useGraphState';
import { dispatchAdHocSearch, toUserFacingError } from '../../shared/services/searchService';
import { transformRowsToGraph } from '../../shared/services/graphTransformer';
import { getSettings, relationshipSourceFromSettings } from '../../shared/services/configService';
import { loadNodeTypeConfig, loadRelationshipTypeConfig, deriveNodeTypeList, deriveRelationshipTypeList } from '../../shared/services/typeConfigService';
import { recordAuditEvent, AUDIT_ACTIONS } from '../../shared/services/auditService';
import { findShortestPath } from '../../shared/services/pathFinder';
import { buildExportBlob } from '../../shared/services/exportService';
import { parseImportedGraphJson } from '../../shared/services/importService';
import { buildEvidenceTokensForEdge, buildEvidenceTokensForNode } from '../../shared/services/evidenceQueryBuilder';
import { buildInitialEntitySearchSpl, buildExpandNodeSpl, buildEvidenceSpl } from '../../shared/services/splTemplates';
import { parseGraphQuery } from '../../shared/services/graphQueryLanguage';
import { executeGraphQuery } from '../../shared/services/graphQueryExecutor';
import { sanitizeSearchTerm, isValidId, GraphLensValidationError } from '../../shared/utilities/splSafety';

import GraphToolbar from './components/GraphToolbar';
import GraphCanvas, { fitGraph, centerOnNode } from './components/GraphCanvas';
import NodeTypeFilter from './components/NodeTypeFilter';
import RelationshipTypeFilter from './components/RelationshipTypeFilter';
import RiskFilter from './components/RiskFilter';
import GraphLegend from './components/GraphLegend';
import GraphLimitBanner from './components/GraphLimitBanner';
import NodeDetailsPanel from './components/NodeDetailsPanel';
import EdgeDetailsPanel from './components/EdgeDetailsPanel';
import EvidencePanel from './components/EvidencePanel';
import PathFinderPanel from './components/PathFinderPanel';
import GraphQueryPanel from './components/GraphQueryPanel';
import ExportDialog from './components/ExportDialog';
import ErrorNotification from './components/ErrorNotification';
import EmptyState from './components/EmptyState';
import PageNav from '../../shared/components/PageNav';

const APP_VERSION = '1.7.1';

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

export default function App() {
  const [settings, setSettings] = useState(null);
  const [nodeTypeConfig, setNodeTypeConfig] = useState({});
  const [relationshipTypeConfig, setRelationshipTypeConfig] = useState({});
  const [error, setError] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [layoutToken, setLayoutToken] = useState(0);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [evidence, setEvidence] = useState({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
  const [pathEndpoints, setPathEndpoints] = useState({ startNodeId: null, endNodeId: null });
  const [path, setPath] = useState(null);
  const [queryState, setQueryState] = useState({ isRunning: false, error: null, result: null });
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
      const [loadedSettings, nodeTypes, relTypes] = await Promise.all([
        getSettings(),
        loadNodeTypeConfig(),
        loadRelationshipTypeConfig(),
      ]);
      if (cancelled) return;
      setSettings(loadedSettings);
      setNodeTypeConfig(nodeTypes);
      setRelationshipTypeConfig(relTypes);
    })();
    return () => { cancelled = true; };
  }, []);

  const timeRange = { earliest: state.activeFilters.timeEarliest, latest: state.activeFilters.timeLatest };

  const selectedNode = state.selectedNodeId ? state.visibleNodes[state.selectedNodeId] : null;
  const selectedEdge = state.selectedEdgeId ? state.visibleEdges[state.selectedEdgeId] : null;

  const nodeCount = Object.keys(state.visibleNodes).length;
  const edgeCount = Object.keys(state.visibleEdges).length;
  const limitReached = settings
    ? nodeCount >= settings.maxVisibleNodes || edgeCount >= settings.maxVisibleEdges
    : false;

  const nodeTypeList = useMemo(() => deriveNodeTypeList(Object.values(state.visibleNodes), nodeTypeConfig), [state.visibleNodes, nodeTypeConfig]);
  const relationshipTypeList = useMemo(() => deriveRelationshipTypeList(Object.values(state.visibleEdges), relationshipTypeConfig), [state.visibleEdges, relationshipTypeConfig]);

  // The legend/filter swatches above and the canvas itself must always
  // agree on "what colour is this type" - confirmed live that they did
  // not: with no curated KV Store config, every node rendered the single
  // flat default colour on canvas regardless of type (graphTransformer
  // only sets a node/edge's own `color` field from curated config, never
  // from the colorForType fallback the legend already used), while the
  // legend showed per-type colours it was never actually rendering. These
  // maps are the single source of truth for both; see nodes/edges below.
  const nodeColorByType = useMemo(() => Object.fromEntries(nodeTypeList.map((nt) => [nt.node_type, nt.color])), [nodeTypeList]);
  const relationshipColorByType = useMemo(() => Object.fromEntries(relationshipTypeList.map((rt) => [rt.relationship_type, rt.color])), [relationshipTypeList]);

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
    setLayoutToken((t) => t + 1);
  }, [actions]);

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
      const job = dispatchAdHocSearch(
        spl,
        { earliest: timeRange.earliest, latest: timeRange.latest, maxWaitMs: settings.searchDispatchMaxTimeSeconds * 1000 },
      );
      const { rows, fieldOrder } = await job.waitForResults({ count: 100 });
      setEvidence({ isLoading: false, error: null, rows, fieldOrder, targetLabel: kind === 'node' ? target.label : target.relationshipLabel });
      recordAuditEvent(AUDIT_ACTIONS.VIEW_EVIDENCE, kind === 'node' ? { nodeId: targetId } : { edgeId: targetId });
    } catch (err) {
      const normalized = toUserFacingError(err);
      setEvidence((prev) => ({ ...prev, isLoading: false, error: normalized }));
    }
  }, [settings, state.visibleNodes, state.visibleEdges, timeRange.earliest, timeRange.latest]);

  const handleSetPathEndpoint = useCallback((nodeId) => {
    setPathEndpoints((prev) => (!prev.startNodeId ? { ...prev, startNodeId: nodeId } : { ...prev, endNodeId: nodeId }));
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

  const handleReset = useCallback(() => {
    actions.reset();
    setSearchResults([]);
    setPath(null);
    setPathEndpoints({ startNodeId: null, endNodeId: null });
    setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null });
    setQueryState({ isRunning: false, error: null, result: null });
    setError(null);
    setLayoutToken((t) => t + 1);
  }, [actions]);

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

  const handleImportFile = useCallback((file) => {
    if (!settings || !file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { nodeRows, edgeRows } = parseImportedGraphJson(String(reader.result));
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
        setLayoutToken((t) => t + 1);
        recordAuditEvent(AUDIT_ACTIONS.IMPORT_GRAPH, { detail: `${nodes.length} nodes, ${edges.length} edges` });
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
  }, [settings, actions, nodeTypeConfig, relationshipTypeConfig]);

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
    setLayoutToken((t) => t + 1);
  }, [settings, queryState.result, actions]);

  const handleTimeRangeChange = useCallback((preset) => {
    actions.setActiveFilters({ timeEarliest: preset.earliest, timeLatest: preset.latest });
  }, [actions]);

  const hasGraph = Object.keys(state.visibleNodes).length > 0;

  if (!settings) {
    return <div className="graphlens-app" aria-busy="true" />;
  }

  return (
    <div className="graphlens-app">
      <div className="graphlens-pagenav">
        <PageNav activeTabId="graphlens_relationship_explorer" />
      </div>

      <GraphToolbar
        isSearching={isSearching}
        searchResults={searchResults}
        onSearch={handleSearch}
        onPickResult={handlePickResult}
        earliest={timeRange.earliest}
        latest={timeRange.latest}
        onTimeRangeChange={handleTimeRangeChange}
        layoutName={state.currentLayout}
        onLayoutChange={(name) => actions.setLayout(name)}
        onRecalculateLayout={() => setLayoutToken((t) => t + 1)}
        onFit={() => fitGraph(cyRef.current)}
        onCenterSelected={() => centerOnNode(cyRef.current, state.selectedNodeId)}
        onReset={handleReset}
        onExportOpen={() => setExportDialogOpen(true)}
        exportEnabled={settings.enableExport}
        onImportClick={() => importInputRef.current && importInputRef.current.click()}
        importEnabled={settings.enableExport}
      />
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          handleImportFile(file);
          e.target.value = '';
        }}
      />

      <div className="graphlens-filters">
        <ErrorNotification error={error} onDismiss={() => setError(null)} />
        <NodeTypeFilter nodeTypes={nodeTypeList} hiddenNodeTypes={state.hiddenNodeTypes} onChange={(types) => actions.setHiddenNodeTypes(types)} />
        <RelationshipTypeFilter relationshipTypes={relationshipTypeList} hiddenRelationshipTypes={state.hiddenRelationshipTypes} onChange={(types) => actions.setHiddenRelationshipTypes(types)} />
        <RiskFilter
          riskMin={state.activeFilters.riskMin}
          riskMax={state.activeFilters.riskMax}
          minEventCount={state.activeFilters.minEventCount}
          onChange={(filters) => actions.setActiveFilters(filters)}
        />
        <GraphLegend nodeTypes={nodeTypeList} relationshipTypes={relationshipTypeList} />
        {settings.enablePathFinder && (
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
        )}
        {settings.enableGraphQuery && (
          <GraphQueryPanel
            isRunning={queryState.isRunning}
            error={queryState.error}
            result={queryState.result}
            onRunQuery={handleRunGraphQuery}
            onLoadOntoCanvas={handleLoadQueryResultOntoCanvas}
          />
        )}
      </div>

      <div className="graphlens-canvas-wrapper">
        {!hasGraph && <EmptyState />}
        <GraphCanvas
          nodes={renderable.nodes.map((n) => ({ data: { ...n, color: nodeColorByType[n.type] || n.color } }))}
          edges={renderable.edges.map((e) => ({ data: { ...e, color: relationshipColorByType[e.relationship] || e.color } }))}
          layoutName={state.currentLayout}
          layoutToken={layoutToken}
          pinnedNodeIds={state.pinnedNodeIds}
          highlightedPath={path}
          onSelectNode={(id) => actions.selectNode(id)}
          onSelectEdge={(id) => actions.selectEdge(id)}
          onClearSelection={() => actions.clearSelection()}
          onExpandNode={handleExpandNode}
          onCyReady={(cy) => { cyRef.current = cy; }}
        />
        <GraphLimitBanner
          visible={limitReached}
          nodeCount={nodeCount}
          maxVisibleNodes={settings.maxVisibleNodes}
          edgeCount={edgeCount}
          maxVisibleEdges={settings.maxVisibleEdges}
        />
      </div>

      <div className="graphlens-details">
        {selectedNode && (
          <NodeDetailsPanel
            node={selectedNode}
            isExpanded={isNodeExpanded(selectedNode.id)}
            isPinned={isNodePinned(selectedNode.id)}
            onExpand={handleExpandNode}
            onCollapse={handleCollapseNode}
            onHide={(id) => actions.hideNode(id)}
            onPin={(id) => actions.pinNode(id)}
            onUnpin={(id) => actions.unpinNode(id)}
            onViewEvidence={handleViewEvidence}
            onSetPathEndpoint={handleSetPathEndpoint}
          />
        )}
        {selectedEdge && <EdgeDetailsPanel edge={selectedEdge} onViewEvidence={handleViewEvidence} />}
        {!selectedNode && !selectedEdge && (
          <div className="graphlens-section">
            <h3>Details</h3>
            <p style={{ fontSize: 12, color: '#8a8a8a' }}>Select a node or relationship to see its properties and actions.</p>
          </div>
        )}
      </div>

      <div className="graphlens-evidence">
        <EvidencePanel
          isLoading={evidence.isLoading}
          error={evidence.error}
          rows={evidence.rows}
          fieldOrder={evidence.fieldOrder}
          targetLabel={evidence.targetLabel}
          onClear={() => setEvidence({ isLoading: false, error: null, rows: [], fieldOrder: [], targetLabel: null })}
        />
      </div>

      <ExportDialog
        open={exportDialogOpen}
        allowedFormats={settings.allowedExportFormats.map((f) => (f === 'csv' ? ['csv-nodes', 'csv-edges'] : [f])).flat()}
        onClose={() => setExportDialogOpen(false)}
        onExport={handleExport}
      />
    </div>
  );
}
