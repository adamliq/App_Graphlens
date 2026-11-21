import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import cytoscape from 'cytoscape';
import { STYLESHEET, LAYOUT_OPTIONS } from './GraphCanvas';

/**
 * A small, read-only Cytoscape preview of a graph query's result, shown
 * inline in the query panel's "Diagram" tab - independent of, and never
 * written to, the main canvas (the "Text" tab shows the same result as
 * JSON instead; "Load onto canvas" remains the only way a query result
 * replaces what the main canvas shows). Reuses the main canvas's own
 * stylesheet/layout so a node/edge looks identical in both places.
 */
export default function QueryResultPreview({ nodes, edges }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: STYLESHEET,
      wheelSensitivity: 0.2,
      minZoom: 0.1,
      maxZoom: 4,
      // Read-only: pan/zoom only, no drag-to-reposition, no selection UI
      // of its own - this is a preview, not another place to interact
      // with the graph.
      autoungrabify: true,
      boxSelectionEnabled: false,
    });
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(nodes);
      cy.add(edges);
    });
    if (nodes.length > 0) {
      cy.layout(LAYOUT_OPTIONS.breadthfirst).run();
    }
  }, [nodes, edges]);

  if (nodes.length === 0) {
    return <p style={{ fontSize: 12, color: '#8a8a8a' }}>Nothing to show.</p>;
  }

  return (
    <div
      ref={containerRef}
      style={{ height: 220, border: '1px solid #ddd', borderRadius: 4 }}
      role="img"
      aria-label="Preview of the query result graph"
    />
  );
}

QueryResultPreview.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
};
