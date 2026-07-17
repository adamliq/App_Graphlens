import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import cytoscape from 'cytoscape';

const DEFAULT_NODE_COLOR = '#5A2BE2';
const DEFAULT_EDGE_COLOR = '#9B9B9B';

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
      'text-margin-y': 4,
      'text-wrap': 'ellipsis',
      'text-max-width': '90px',
      width: (ele) => 24 + Math.min(30, (ele.data('riskScore') || 0) / 3),
      height: (ele) => 24 + Math.min(30, (ele.data('riskScore') || 0) / 3),
      'border-width': (ele) => ((ele.data('riskScore') || 0) >= 70 ? 3 : 1),
      'border-color': (ele) => ((ele.data('riskScore') || 0) >= 70 ? '#d93f3f' : '#3a3a3a'),
    },
  },
  {
    selector: 'node[?pinned]',
    style: { 'border-style': 'double', 'border-width': 4, 'border-color': '#2b7de9' },
  },
  {
    selector: 'node:selected',
    style: { 'border-color': '#e97d2b', 'border-width': 4 },
  },
  {
    selector: 'node.graphlens-path-highlight',
    style: { 'background-color': '#e97d2b' },
  },
  {
    selector: 'edge',
    style: {
      width: (ele) => 1 + Math.min(6, Math.log2(1 + (ele.data('eventCount') || 1))),
      'line-color': (ele) => ele.data('color') || DEFAULT_EDGE_COLOR,
      'target-arrow-color': (ele) => ele.data('color') || DEFAULT_EDGE_COLOR,
      'target-arrow-shape': (ele) => (ele.data('directed') === false ? 'none' : 'triangle'),
      'curve-style': 'bezier',
      label: 'data(relationshipLabel)',
      'font-size': 8,
      color: '#4a4a4a',
      'text-rotation': 'autorotate',
    },
  },
  {
    selector: 'edge:selected',
    style: { 'line-color': '#e97d2b', 'target-arrow-color': '#e97d2b', width: 4 },
  },
  {
    selector: 'edge.graphlens-path-highlight',
    style: { 'line-color': '#e97d2b', 'target-arrow-color': '#e97d2b', width: 4 },
  },
];

const LAYOUT_OPTIONS = {
  cose: { name: 'cose', animate: false, nodeRepulsion: 8000, idealEdgeLength: 90, fit: true },
  concentric: { name: 'concentric', animate: false, fit: true },
  breadthfirst: { name: 'breadthfirst', animate: false, fit: true, directed: true },
  circle: { name: 'circle', animate: false, fit: true },
  grid: { name: 'grid', animate: false, fit: true },
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
  highlightedPath,
  onSelectNode,
  onSelectEdge,
  onClearSelection,
  onExpandNode,
  onCyReady,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLESHEET,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => onSelectNode(evt.target.id()));
    cy.on('tap', 'edge', (evt) => onSelectEdge(evt.target.id()));
    cy.on('tap', (evt) => {
      if (evt.target === cy) onClearSelection();
    });
    cy.on('dbltap', 'node', (evt) => onExpandNode(evt.target.id()));

    if (onCyReady) onCyReady(cy);

    return () => {
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
        if (!nextNodeIds.has(ele.id())) ele.remove();
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
          cy.add({ group: 'nodes', data });
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

  // Layout only re-runs when layoutToken changes (explicit "recalculate
  // layout" action, a fresh search, or an expansion), never on selection.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || cy.nodes().length === 0) return;
    const options = LAYOUT_OPTIONS[layoutName] || LAYOUT_OPTIONS.cose;
    cy.layout(options).run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutToken, layoutName]);

  return <div ref={containerRef} className="graphlens-canvas" role="img" aria-label="Relationship graph canvas" />;
}

GraphCanvas.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
  layoutName: PropTypes.string.isRequired,
  layoutToken: PropTypes.number.isRequired,
  pinnedNodeIds: PropTypes.array.isRequired,
  highlightedPath: PropTypes.shape({ nodeIds: PropTypes.array, edgeIds: PropTypes.array }),
  onSelectNode: PropTypes.func.isRequired,
  onSelectEdge: PropTypes.func.isRequired,
  onClearSelection: PropTypes.func.isRequired,
  onExpandNode: PropTypes.func.isRequired,
  onCyReady: PropTypes.func,
};

GraphCanvas.defaultProps = {
  highlightedPath: null,
  onCyReady: undefined,
};

export function fitGraph(cy) {
  if (cy) cy.fit(undefined, 30);
}

export function centerOnNode(cy, nodeId) {
  if (!cy) return;
  const ele = cy.getElementById(nodeId);
  if (ele && ele.length > 0) {
    cy.animate({ center: { eles: ele }, zoom: Math.max(cy.zoom(), 1) }, { duration: 200 });
  }
}

export const CYTOSCAPE_LAYOUTS = Object.keys(LAYOUT_OPTIONS);
