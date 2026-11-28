import React, { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import cytoscape from 'cytoscape';
import NodeContextMenu from './NodeContextMenu';
import EdgeContextMenu from './EdgeContextMenu';

const DEFAULT_NODE_COLOR = '#5A2BE2';
// 1.24.0: was #9B9B9B (2.66:1 against the canvas); #767676 is 4.33:1.
const DEFAULT_EDGE_COLOR = '#767676';
// Matches .graphlens-canvas-wrapper's --graphlens-canvas-bg fallback in
// App.css, so an edge label's background reads as part of the plain
// canvas rather than a visible, mismatched box.
const CANVAS_BG_COLOR = '#fafafa';

/**
 * Fixed status meanings, independent of a node/edge's own type colour -
 * kept out of typeConfigService.js's FALLBACK_PALETTE so a type can never
 * coincidentally look like one of these states. See the channel list
 * below STATUS_COLORS for how each status is drawn.
 */
const STATUS_COLORS = {
  risk: '#b3261e',
  pinned: '#2b3033',
  selected: '#1a1a1a',
  pathHighlight: '#1f9e54',
};

// 1.24.0: each status has its own visual channel, so no status can hide
// another (confirmed live in the 1.23.0 audit: the path highlight replaced
// both the selected and the pinned border, so neither was visible on a
// highlighted path) and none of them changes a node's fill (the risk halo
// used to be drawn *over* the node, tinting its type colour):
//   - selected      -> a dark outer ring (Cytoscape `outline`)
//   - pinned        -> a double border
//   - on the path   -> a green border (dashed, or double when also pinned)
//   - high risk     -> a red glow *behind* the node (`underlay`)
// Every status colour is >= 3:1 against the canvas, and none of them is a
// node-type colour (see typeConfigService.js's FALLBACK_PALETTE).
const HIGH_RISK_UNDERLAY_OPACITY = 0.7; // #b3261e at 70% over #fafafa = 3.65:1

const HIGH_RISK_THRESHOLD = 70;

// 1.23.0: the highest zoom an automatic fit (Fit to screen, or a layout's
// own fit) may leave the graph at. Without it, fitting a graph of one or
// two nodes zoomed all the way to maxZoom (4x), turning a 10px label into
// a 40px one that dwarfed the rest of the page. Manual zooming can still
// go to maxZoom.
const FIT_MAX_ZOOM = 1.75;

function capFitZoom(cy) {
  if (cy.zoom() > FIT_MAX_ZOOM) {
    cy.zoom(FIT_MAX_ZOOM);
    cy.center();
  }
}

const STYLESHEET = [
  {
    selector: 'node',
    style: {
      'background-color': (ele) => ele.data('color') || DEFAULT_NODE_COLOR,
      shape: (ele) => ele.data('shape') || 'ellipse',
      label: 'data(label)',
      color: '#1a1a1a',
      'font-size': 10,
      'text-valign': 'bottom',
      'text-margin-y': 6,
      'text-wrap': 'ellipsis',
      'text-max-width': '90px',
      // A node label sits below the node on the plain canvas; a background
      // matching the canvas keeps it readable where an edge passes under it.
      'text-background-color': CANVAS_BG_COLOR,
      'text-background-opacity': 1,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '2px',
      width: (ele) => 24 + Math.min(30, (ele.data('riskScore') || 0) / 3),
      height: (ele) => 24 + Math.min(30, (ele.data('riskScore') || 0) / 3),
      'border-width': 1,
      'border-color': '#3a3a3a',
      'underlay-color': STATUS_COLORS.risk,
      'underlay-shape': 'ellipse',
      'underlay-padding': 7,
      'underlay-opacity': (ele) => ((ele.data('riskScore') || 0) >= HIGH_RISK_THRESHOLD ? HIGH_RISK_UNDERLAY_OPACITY : 0),
    },
  },
  {
    // Colour only - the double style is applied by the later pinned rule,
    // so a pinned node on the highlighted path keeps the path's green.
    selector: 'node[?pinned]',
    style: { 'border-color': STATUS_COLORS.pinned },
  },
  {
    // Border only, never background-color - a highlighted path must never
    // hide which type a node is.
    selector: 'node.graphlens-path-highlight',
    style: { 'border-color': STATUS_COLORS.pathHighlight, 'border-width': 4, 'border-style': 'dashed' },
  },
  {
    selector: 'node[?pinned]',
    style: { 'border-style': 'double', 'border-width': 6 },
  },
  {
    selector: 'node:selected',
    style: {
      'outline-width': 3,
      'outline-style': 'solid',
      'outline-color': STATUS_COLORS.selected,
      'outline-offset': 3,
      'outline-opacity': 1,
    },
  },
  {
    // Edge labels are drawn on top of the line, whose colour varies per
    // relationship type, so the label gets a canvas-coloured background.
    selector: 'edge',
    style: {
      width: (ele) => 1.5 + Math.min(6, Math.log2(1 + (ele.data('eventCount') || 1))),
      'line-color': (ele) => ele.data('color') || DEFAULT_EDGE_COLOR,
      'target-arrow-color': (ele) => ele.data('color') || DEFAULT_EDGE_COLOR,
      'target-arrow-shape': (ele) => (ele.data('directed') === false ? 'none' : 'triangle'),
      'curve-style': 'bezier',
      label: 'data(relationshipLabel)',
      'font-size': 8,
      color: '#1a1a1a',
      'text-background-color': CANVAS_BG_COLOR,
      'text-background-opacity': 1,
      'text-background-shape': 'roundrectangle',
      'text-background-padding': '2px',
      'text-rotation': 'autorotate',
      // Long relationship labels are cut with an ellipsis like node labels
      // already are, instead of running the full length of the edge.
      'text-wrap': 'ellipsis',
      'text-max-width': '120px',
    },
  },
  {
    selector: 'edge.graphlens-path-highlight',
    style: { 'line-color': STATUS_COLORS.pathHighlight, 'target-arrow-color': STATUS_COLORS.pathHighlight, width: 4 },
  },
  {
    // 1.24.0: a dark outline around the line (keeping its own colour), the
    // edge counterpart of a selected node's dark ring - it used to recolour
    // the line orange, which also hid the path highlight.
    selector: 'edge:selected',
    style: { 'line-outline-width': 2, 'line-outline-color': STATUS_COLORS.selected, width: 4 },
  },
];

// Every layout below defaults `nodeDimensionsIncludeLabels` to false (a
// Cytoscape core default, confirmed by reading its layout source) - the
// spacing/overlap-avoidance math only ever considered each node's own
// circle, never its label text below it. Confirmed live: with labels
// excluded, an adjacent node's label routinely overlapped another node's
// label or an edge's own label, making both unreadable. `true` here makes
// every layout treat "node + its label" as the shape that must not
// overlap.
const LAYOUT_OPTIONS = {
  cose: {
    name: 'cose', animate: false, nodeRepulsion: 8000, idealEdgeLength: 90, fit: true, nodeDimensionsIncludeLabels: true,
  },
  // minNodeSpacing's 10px default is a flat ring-to-ring cushion on top of
  // nodeDimensionsIncludeLabels's own sizing - confirmed live that with a
  // small, low-degree-variance graph (concentric's rings collapse close
  // together in that case) 10px still left an edge label crowding the
  // node label directly below it. 28px gives real breathing room without
  // visibly changing well-spaced, larger graphs.
  concentric: {
    name: 'concentric', animate: false, fit: true, nodeDimensionsIncludeLabels: true, minNodeSpacing: 28,
  },
  breadthfirst: {
    name: 'breadthfirst', animate: false, fit: true, directed: true, nodeDimensionsIncludeLabels: true,
  },
  circle: { name: 'circle', animate: false, fit: true, nodeDimensionsIncludeLabels: true },
  grid: { name: 'grid', animate: false, fit: true, nodeDimensionsIncludeLabels: true },
};

/**
 * Cytoscape.js canvas. Rendering-only: all graph state, expansion logic
 * and search dispatch live outside this component (App.jsx / useGraphState
 * / graphStateReducer). Layout only re-runs when `layoutToken` changes, so
 * ordinary selection/hover interactions never trigger an expensive full
 * relayout (section 12 requirement).
 */
export default function GraphCanvas({
  nodes,
  edges,
  layoutName,
  layoutToken,
  pinnedNodeIds,
  expandedNodeIds,
  highlightedPath,
  selectedNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onExpandNode,
  onCollapseNode,
  onHideNode,
  onPinNode,
  onUnpinNode,
  onViewEvidence,
  onSetPathStart,
  onSetPathEnd,
  onMultiSelectNodes,
  onCyReady,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  // 1.25.0: last known position of every node removed from the canvas, so
  // a node brought back by Undo / Show (Hidden nodes) returns to where it
  // was rather than the canvas origin - confirmed live it reappeared in
  // the top-left corner, half off-screen.
  const lastPositionsRef = useRef({});
  // One shared slot for either kind of right-click menu (never both at
  // once, since a single click can only ever hit one element) - `kind`
  // picks which of NodeContextMenu/EdgeContextMenu is actually open
  // below, both sharing the same close-on-tap/pan/zoom behaviour.
  const [contextMenu, setContextMenu] = useState({ open: false, kind: null, id: null, point: null });
  // 1.25.0: the menus anchor to this 1px element, placed at the click (or
  // the selected element, from the keyboard). Popover's `pointTo` does not
  // move the popover itself, so anchoring to the whole canvas put the menu
  // against the canvas edge - measured off-screen once the menu grew.
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  // 1.25.0: closing the menu returns keyboard focus to the canvas when the
  // menu had it (Escape, or choosing an item) - it used to fall to <body>.
  const closeContextMenu = () => {
    setContextMenu((s) => (s.open ? { ...s, open: false } : s));
    const active = document.activeElement;
    if (containerRef.current && (!active || active === document.body || (active.closest && active.closest('.graphlens-context-menu')))) {
      containerRef.current.focus({ preventScroll: true });
    }
  };

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLESHEET,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      // Box selection starts disabled - enabling it unconditionally would
      // change Cytoscape's default background-drag from panning to
      // drawing a selection box, regressing the plain click-and-drag pan
      // every earlier version of this app has had. Instead it is toggled
      // on only while Shift is held (see the keydown/keyup listeners
      // below), the same convention most diagramming/graph tools use for
      // rubber-band multi-select, so ordinary panning is never affected.
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => onSelectNode(evt.target.id()));
    cy.on('tap', 'edge', (evt) => onSelectEdge(evt.target.id()));
    cy.on('tap', (evt) => {
      if (evt.target === cy) onClearSelection();
    });
    cy.on('dbltap', 'node', (evt) => onExpandNode(evt.target.id()));
    // Cytoscape maintains its own independent multi-element :selected set
    // (populated by a Shift-drag box-select, ctrl/shift-click, or
    // selectNodesByType below) - reported here so the app can offer bulk
    // actions when more than one node is selected, without disturbing the
    // single-selection state above (selectedNodeId/selectedEdgeId), which
    // still drives the details panel exactly as before.
    cy.on('select unselect', 'node', () => onMultiSelectNodes(cy.nodes(':selected').map((n) => n.id())));

    // Right-click (cxttap) a node or edge: select it exactly like a left
    // click would (so the Details panel agrees with whatever the menu
    // is about to act on), then open the matching context menu at the
    // click's position relative to this canvas (renderedPosition, which
    // is already in the same coordinate space Popover's `pointTo`
    // expects relative to its anchor). The container's own native
    // `contextmenu` listener below suppresses the browser's own
    // right-click menu everywhere on the canvas, element or not, so
    // right-clicking empty background never shows a mismatched browser
    // menu next to ours (it just shows no menu at all).
    cy.on('cxttap', 'node', (evt) => {
      onSelectNode(evt.target.id());
      setContextMenu({ open: true, kind: 'node', id: evt.target.id(), point: { x: evt.renderedPosition.x, y: evt.renderedPosition.y } });
    });
    cy.on('cxttap', 'edge', (evt) => {
      onSelectEdge(evt.target.id());
      setContextMenu({ open: true, kind: 'edge', id: evt.target.id(), point: { x: evt.renderedPosition.x, y: evt.renderedPosition.y } });
    });
    // Close the menu on any ordinary tap (selection/deselection already
    // handled by the listeners above) and whenever the viewport moves,
    // so it never floats disconnected from the element it was opened for.
    cy.on('tap pan zoom', () => closeContextMenu());

    const containerEl = containerRef.current;
    const preventNativeContextMenu = (evt) => evt.preventDefault();
    containerEl.addEventListener('contextmenu', preventNativeContextMenu);

    // 1.25.0: keyboard access to the right-click menu. The canvas itself
    // is focusable (tabIndex below); Shift+F10 or the Menu key opens the
    // menu for whatever is currently selected (chosen via search, the
    // Table view, or a click), positioned at that element.
    const openMenuFromKeyboard = (evt) => {
      if (!((evt.key === 'F10' && evt.shiftKey) || evt.key === 'ContextMenu')) return;
      const selected = cy.$(':selected');
      if (selected.length !== 1) return;
      evt.preventDefault();
      const ele = selected[0];
      const point = ele.isNode() ? ele.renderedPosition() : ele.renderedMidpoint();
      setContextMenu({ open: true, kind: ele.isNode() ? 'node' : 'edge', id: ele.id(), point: { x: point.x, y: point.y } });
    };
    containerEl.addEventListener('keydown', openMenuFromKeyboard);

    const handleKeyDown = (evt) => { if (evt.key === 'Shift') cy.boxSelectionEnabled(true); };
    const handleKeyUp = (evt) => { if (evt.key === 'Shift') cy.boxSelectionEnabled(false); };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    if (onCyReady) onCyReady(cy);

    return () => {
      containerEl.removeEventListener('contextmenu', preventNativeContextMenu);
      containerEl.removeEventListener('keydown', openMenuFromKeyboard);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
      cy.destroy();
      cyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Incremental element sync: add/update/remove only what changed, so
  // panning/zoom/selection state survives ordinary graph updates.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      const nextNodeIds = new Set(nodes.map((n) => n.data.id));
      const nextEdgeIds = new Set(edges.map((e) => e.data.id));

      cy.nodes().forEach((ele) => {
        if (!nextNodeIds.has(ele.id())) {
          lastPositionsRef.current[ele.id()] = { ...ele.position() };
          ele.remove();
        }
      });
      cy.edges().forEach((ele) => {
        if (!nextEdgeIds.has(ele.id())) ele.remove();
      });

      nodes.forEach((n) => {
        const pinned = pinnedNodeIds.includes(n.data.id);
        const data = { ...n.data, pinned };
        const existing = cy.getElementById(n.data.id);
        if (existing.length > 0) {
          existing.data(data);
        } else {
          const remembered = lastPositionsRef.current[n.data.id];
          cy.add(remembered ? { group: 'nodes', data, position: remembered } : { group: 'nodes', data });
        }
      });

      edges.forEach((e) => {
        const existing = cy.getElementById(e.data.id);
        if (existing.length > 0) {
          existing.data(e.data);
        } else {
          cy.add({ group: 'edges', data: e.data });
        }
      });

      cy.elements().removeClass('graphlens-path-highlight');
      if (highlightedPath) {
        highlightedPath.nodeIds.forEach((id) => cy.getElementById(id).addClass('graphlens-path-highlight'));
        highlightedPath.edgeIds.forEach((id) => cy.getElementById(id).addClass('graphlens-path-highlight'));
      }
    });
  }, [nodes, edges, pinnedNodeIds, highlightedPath]);

  // 1.25.0: keep the canvas's own selection in step with the app's
  // single selection when it changes from outside the canvas - picking a
  // search result or a Table view row used to show the node in the details
  // panel with no selected ring on the graph. A click on the canvas
  // selects natively first, so this is then a no-op.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const id = selectedNodeId || selectedEdgeId;
    if (!id) return;
    const ele = cy.getElementById(id);
    if (ele.length === 0 || ele.selected()) return;
    cy.elements().unselect();
    ele.select();
  }, [selectedNodeId, selectedEdgeId, nodes, edges]);

  // Layout only re-runs when layoutToken changes (explicit "recalculate
  // layout" action, a fresh search, or an expansion), never on selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    const options = LAYOUT_OPTIONS[layoutName] || LAYOUT_OPTIONS.cose;
    const layout = cy.layout(options);
    layout.one('layoutstop', () => capFitZoom(cy));
    layout.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutToken, layoutName]);

  const contextMenuNodeId = contextMenu.kind === 'node' ? contextMenu.id : null;
  const contextMenuEdgeId = contextMenu.kind === 'edge' ? contextMenu.id : null;
  const contextMenuNode = contextMenuNodeId
    ? (nodes.find((n) => n.data.id === contextMenuNodeId) || { data: { id: contextMenuNodeId, label: contextMenuNodeId } }).data
    : null;
  const contextMenuEdge = contextMenuEdgeId
    ? (edges.find((e) => e.data.id === contextMenuEdgeId) || { data: { id: contextMenuEdgeId, relationshipLabel: contextMenuEdgeId } }).data
    : null;

  return (
    <>
      {/*
        1.25.0: focusable, so the right-click menu can be opened from the
        keyboard (Shift+F10 / Menu key) and focus has somewhere to return
        to when it closes.
      */}
      <div
        ref={containerRef}
        className="graphlens-canvas graphlens-focus-ring"
        role="group"
        tabIndex={0}
        aria-label="Relationship graph. Press Shift+F10 for actions on the selected node or relationship."
      />
      <span
        ref={setMenuAnchorEl}
        className="graphlens-menu-anchor"
        aria-hidden="true"
        style={{ left: contextMenu.point ? contextMenu.point.x : 0, top: contextMenu.point ? contextMenu.point.y : 0 }}
      />
      <NodeContextMenu
        open={contextMenu.open && contextMenu.kind === 'node'}
        anchor={menuAnchorEl}
        node={contextMenuNode}
        isExpanded={contextMenuNodeId ? expandedNodeIds.includes(contextMenuNodeId) : false}
        isPinned={contextMenuNodeId ? pinnedNodeIds.includes(contextMenuNodeId) : false}
        onRequestClose={closeContextMenu}
        onExpand={onExpandNode}
        onCollapse={onCollapseNode}
        onHide={onHideNode}
        onPin={onPinNode}
        onUnpin={onUnpinNode}
        onViewEvidence={onViewEvidence}
        onSetPathStart={onSetPathStart}
        onSetPathEnd={onSetPathEnd}
        onCenter={(nodeId) => centerOnNode(cyRef.current, nodeId)}
      />
      <EdgeContextMenu
        open={contextMenu.open && contextMenu.kind === 'edge'}
        anchor={menuAnchorEl}
        edge={contextMenuEdge}
        onRequestClose={closeContextMenu}
        onViewEvidence={onViewEvidence}
      />
    </>
  );
}

GraphCanvas.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
  layoutName: PropTypes.string.isRequired,
  layoutToken: PropTypes.number.isRequired,
  pinnedNodeIds: PropTypes.array.isRequired,
  expandedNodeIds: PropTypes.array.isRequired,
  highlightedPath: PropTypes.shape({ nodeIds: PropTypes.array, edgeIds: PropTypes.array }),
  selectedNodeId: PropTypes.string,
  selectedEdgeId: PropTypes.string,
  onSelectNode: PropTypes.func.isRequired,
  onSelectEdge: PropTypes.func.isRequired,
  onClearSelection: PropTypes.func.isRequired,
  onExpandNode: PropTypes.func.isRequired,
  onCollapseNode: PropTypes.func.isRequired,
  onHideNode: PropTypes.func.isRequired,
  onPinNode: PropTypes.func.isRequired,
  onUnpinNode: PropTypes.func.isRequired,
  onViewEvidence: PropTypes.func.isRequired,
  onSetPathStart: PropTypes.func.isRequired,
  onSetPathEnd: PropTypes.func.isRequired,
  onMultiSelectNodes: PropTypes.func.isRequired,
  onCyReady: PropTypes.func,
};

GraphCanvas.defaultProps = {
  highlightedPath: null,
  selectedNodeId: null,
  selectedEdgeId: null,
  onCyReady: undefined,
};

export function fitGraph(cy) {
  if (!cy) return;
  cy.fit(undefined, 30);
  capFitZoom(cy);
}

/**
 * Fits the view to the given element ids (1.25.0, a found path) with
 * enough padding to keep them clear of the path status chip drawn over
 * the top-left of the canvas, capped like every other automatic fit.
 */
export function fitElements(cy, ids, padding = 70) {
  if (!cy || !ids || ids.length === 0) return;
  const eles = cy.collection();
  ids.forEach((id) => { eles.merge(cy.getElementById(id)); });
  if (eles.length === 0) return;
  cy.fit(eles, padding);
  capFitZoom(cy);
}

export function centerOnNode(cy, nodeId) {
  if (!cy) return;
  const ele = cy.getElementById(nodeId);
  if (ele && ele.length > 0) {
    cy.animate({ center: { eles: ele }, zoom: Math.max(cy.zoom(), 1) }, { duration: 200 });
  }
}

/**
 * Selects every currently-visible node of `nodeType` (a legend click),
 * replacing whatever was selected before - the same Cytoscape-native
 * selection the "select unselect" listener above already reports to the
 * app, so this feeds the same multi-select/bulk-actions path a box/lasso
 * drag does. Uses a predicate rather than a Cytoscape selector string so
 * no value is ever interpolated into selector syntax.
 */
export function selectNodesByType(cy, nodeType) {
  if (!cy) return;
  cy.nodes().unselect();
  cy.nodes().filter((n) => n.data('type') === nodeType).select();
}

export const CYTOSCAPE_LAYOUTS = Object.keys(LAYOUT_OPTIONS);
export { STATUS_COLORS, HIGH_RISK_THRESHOLD };
