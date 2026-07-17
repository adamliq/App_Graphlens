import React from 'react';
import PropTypes from 'prop-types';

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
    </div>
  );
}

GraphLegend.propTypes = {
  nodeTypes: PropTypes.array.isRequired,
  relationshipTypes: PropTypes.array.isRequired,
};
