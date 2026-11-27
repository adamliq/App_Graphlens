import React from 'react';
import PropTypes from 'prop-types';
import TypeSwatch from './TypeSwatch';

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
              {/* 1.24.0: a hidden type's label is struck through and muted, not just unticked. */}
              <label htmlFor={inputId} className={hiddenNodeTypes.includes(nt.node_type) ? 'graphlens-type-label graphlens-type-label-hidden' : 'graphlens-type-label'}>
                <TypeSwatch color={nt.color} shape={nt.shape} />
                {nt.display_label || nt.node_type}
              </label>
            </li>
          );
        })}
        {nodeTypes.length === 0 && <li style={{ fontSize: 12, color: '#6b7378' }}>No node types observed yet.</li>}
      </ul>
    </div>
  );
}

NodeTypeFilter.propTypes = {
  nodeTypes: PropTypes.array.isRequired,
  hiddenNodeTypes: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};
