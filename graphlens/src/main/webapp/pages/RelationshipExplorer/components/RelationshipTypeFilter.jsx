import React from 'react';
import PropTypes from 'prop-types';

export default function RelationshipTypeFilter({ relationshipTypes, hiddenRelationshipTypes, onChange }) {
  const toggle = (type) => {
    const next = hiddenRelationshipTypes.includes(type)
      ? hiddenRelationshipTypes.filter((t) => t !== type)
      : [...hiddenRelationshipTypes, type];
    onChange(next);
  };

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-rel-type-filter-heading">Relationship types</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-labelledby="graphlens-rel-type-filter-heading">
        {relationshipTypes.map((rt) => {
          const inputId = `graphlens-rel-type-${rt.relationship_type}`;
          return (
            <li key={rt.relationship_type} style={{ marginBottom: 4 }}>
              <input
                id={inputId}
                type="checkbox"
                className="graphlens-focusable"
                checked={!hiddenRelationshipTypes.includes(rt.relationship_type)}
                onChange={() => toggle(rt.relationship_type)}
              />
              <label htmlFor={inputId} style={{ marginLeft: 6, fontSize: 13 }}>
                <span className="graphlens-legend-swatch" style={{ backgroundColor: rt.color, display: 'inline-block' }} />
                {' '}
                {rt.display_label || rt.relationship_type}
              </label>
            </li>
          );
        })}
        {relationshipTypes.length === 0 && <li style={{ fontSize: 12, color: '#8a8a8a' }}>No relationship types observed yet.</li>}
      </ul>
    </div>
  );
}

RelationshipTypeFilter.propTypes = {
  relationshipTypes: PropTypes.array.isRequired,
  hiddenRelationshipTypes: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};
