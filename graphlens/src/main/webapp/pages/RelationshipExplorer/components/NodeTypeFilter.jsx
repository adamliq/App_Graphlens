import React from 'react';
import PropTypes from 'prop-types';

/** Checkbox list toggling which node types are hidden. Accessible: native inputs, each with a bound <label>, no colour-only indication (a swatch plus the type name). */
export default function NodeTypeFilter({ nodeTypes, hiddenNodeTypes, onChange }) {
  const toggle = (type) => {
    const next = hiddenNodeTypes.includes(type)
      ? hiddenNodeTypes.filter((t) => t !== type)
      : [...hiddenNodeTypes, type];
    onChange(next);
  };

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-node-type-filter-heading">Node types</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-labelledby="graphlens-node-type-filter-heading">
        {nodeTypes.map((nt) => {
          const inputId = `graphlens-node-type-${nt.node_type}`;
          return (
            <li key={nt.node_type} style={{ marginBottom: 4 }}>
              <input
                id={inputId}
                type="checkbox"
                className="graphlens-focusable"
                checked={!hiddenNodeTypes.includes(nt.node_type)}
                onChange={() => toggle(nt.node_type)}
              />
              <label htmlFor={inputId} style={{ marginLeft: 6, fontSize: 13 }}>
                <span className="graphlens-legend-swatch" style={{ backgroundColor: nt.color, display: 'inline-block' }} />
                {' '}
                {nt.display_label || nt.node_type}
              </label>
            </li>
          );
        })}
        {nodeTypes.length === 0 && <li style={{ fontSize: 12, color: '#8a8a8a' }}>No node types observed yet.</li>}
      </ul>
    </div>
  );
}

NodeTypeFilter.propTypes = {
  nodeTypes: PropTypes.array.isRequired,
  hiddenNodeTypes: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};
