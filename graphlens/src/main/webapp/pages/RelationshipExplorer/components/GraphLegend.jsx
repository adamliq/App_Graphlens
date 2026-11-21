import React from 'react';
import PropTypes from 'prop-types';
import { STATUS_COLORS, HIGH_RISK_THRESHOLD } from './GraphCanvas';

const INDICATORS = [
  { key: 'risk', label: `Risk score ≥ ${HIGH_RISK_THRESHOLD} (halo)`, color: STATUS_COLORS.risk },
  { key: 'pinned', label: 'Pinned (double border)', color: STATUS_COLORS.pinned },
  { key: 'selected', label: 'Selected (border)', color: STATUS_COLORS.selected },
  { key: 'pathHighlight', label: 'On highlighted path (dashed border)', color: STATUS_COLORS.pathHighlight },
];

export default function GraphLegend({ nodeTypes, relationshipTypes }) {
  return (
    <div className="graphlens-section">
      <h3 id="graphlens-legend-heading">Legend</h3>
      <div aria-labelledby="graphlens-legend-heading">
        {nodeTypes.slice(0, 12).map((nt) => (
          <div className="graphlens-legend-item" key={nt.node_type}>
            <span className="graphlens-legend-swatch" style={{ backgroundColor: nt.color }} />
            <span>{nt.display_label || nt.node_type}</span>
          </div>
        ))}
        {relationshipTypes.slice(0, 8).map((rt) => (
          <div className="graphlens-legend-item" key={rt.relationship_type}>
            <span className="graphlens-legend-swatch" style={{ backgroundColor: rt.color, borderRadius: '50%' }} />
            <span>{rt.display_label || rt.relationship_type}</span>
          </div>
        ))}
      </div>
      <h3 id="graphlens-indicators-heading" style={{ marginTop: 12 }}>Indicators</h3>
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
};
