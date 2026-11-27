import React from 'react';
import PropTypes from 'prop-types';
import { HIGH_RISK_THRESHOLD } from './GraphCanvas';
import TypeSwatch from './TypeSwatch';

// 1.24.0: each sample is drawn the way the canvas draws that status (see
// GraphCanvas.jsx's channel list) - red glow, double border, dark outer
// ring, green dashed border - rather than four identical coloured squares.
const INDICATORS = [
  { key: 'risk', label: `High risk (score ≥ ${HIGH_RISK_THRESHOLD}): red glow` },
  { key: 'pinned', label: 'Pinned: double border' },
  { key: 'selected', label: 'Selected: dark outer ring' },
  { key: 'path', label: 'On highlighted path: green dashed border' },
];

export default function GraphLegend({ nodeTypes, relationshipTypes, onSelectNodeType }) {
  return (
    <div className="graphlens-section">
      <div aria-labelledby="graphlens-legend-heading">
        {nodeTypes.slice(0, 12).map((nt) => (
          <button
            key={nt.node_type}
            type="button"
            className="graphlens-legend-item graphlens-legend-item-button"
            onClick={() => onSelectNodeType(nt.node_type)}
            title={`Select every visible ${nt.display_label || nt.node_type} node`}
          >
            <TypeSwatch color={nt.color} shape={nt.shape} />
            <span className="graphlens-legend-label">{nt.display_label || nt.node_type}</span>
            {/* 1.24.0: says what clicking does; shown on hover/focus via CSS. */}
            <span className="graphlens-legend-hint" aria-hidden="true">Select</span>
          </button>
        ))}
        {relationshipTypes.slice(0, 8).map((rt) => (
          <div className="graphlens-legend-item" key={rt.relationship_type}>
            <TypeSwatch color={rt.color} kind="relationship" />
            <span>{rt.display_label || rt.relationship_type}</span>
          </div>
        ))}
      </div>
      <h4 id="graphlens-indicators-heading" className="graphlens-subheading">Indicators</h4>
      <div aria-labelledby="graphlens-indicators-heading">
        {INDICATORS.map((ind) => (
          <div className="graphlens-legend-item" key={ind.key}>
            <span className={`graphlens-indicator-sample graphlens-indicator-${ind.key}`} aria-hidden="true" />
            <span>{ind.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

GraphLegend.propTypes = {
  nodeTypes: PropTypes.array.isRequired,
  relationshipTypes: PropTypes.array.isRequired,
  onSelectNodeType: PropTypes.func.isRequired,
};
