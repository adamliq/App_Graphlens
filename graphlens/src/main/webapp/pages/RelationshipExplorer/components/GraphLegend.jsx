import React from 'react';
import PropTypes from 'prop-types';
import { STATUS_COLORS, HIGH_RISK_THRESHOLD } from './GraphCanvas';

const INDICATORS = [
  { key: 'risk', label: `Risk score ≥ ${HIGH_RISK_THRESHOLD} (halo)`, color: STATUS_COLORS.risk },
  { key: 'pinned', label: 'Pinned (double border)', color: STATUS_COLORS.pinned },
  { key: 'selected', label: 'Selected (border)', color: STATUS_COLORS.selected },
  { key: 'pathHighlight', label: 'On highlighted path (dashed border)', color: STATUS_COLORS.pathHighlight },
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
            <span className="graphlens-legend-swatch" style={{ backgroundColor: nt.color }} />
            <span>{nt.display_label || nt.node_type}</span>
          </button>
        ))}
        {relationshipTypes.slice(0, 8).map((rt) => (
          <div className="graphlens-legend-item" key={rt.relationship_type}>
            <span className="graphlens-legend-swatch" style={{ backgroundColor: rt.color, borderRadius: '50%' }} />
            <span>{rt.display_label || rt.relationship_type}</span>
          </div>
        ))}
      </div>
      <h4 id="graphlens-indicators-heading" className="graphlens-subheading">Indicators</h4>
      <div aria-labelledby="graphlens-indicators-heading">
        {INDICATORS.map((ind) => (
          <div className="graphlens-legend-item" key={ind.key}>
            <span className="graphlens-legend-swatch" style={{ backgroundColor: '#fff', borderColor: ind.color, borderWidth: 2 }} />
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
