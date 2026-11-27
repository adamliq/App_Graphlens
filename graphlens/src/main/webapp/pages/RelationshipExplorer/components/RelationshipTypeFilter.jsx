import React from 'react';
import PropTypes from 'prop-types';
import TypeSwatch from './TypeSwatch';

export default function RelationshipTypeFilter({ relationshipTypes, hiddenRelationshipTypes, onChange }) {
  const toggle = (type) => {
    const next = hiddenRelationshipTypes.includes(type)
      ? hiddenRelationshipTypes.filter((t) => t !== type)
      : [...hiddenRelationshipTypes, type];
    onChange(next);
  };

  return (
    <div className="graphlens-section">
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
              {/* 1.24.0: a hidden type's label is struck through and muted, not just unticked. */}
              <label htmlFor={inputId} className={hiddenRelationshipTypes.includes(rt.relationship_type) ? 'graphlens-type-label graphlens-type-label-hidden' : 'graphlens-type-label'}>
                <TypeSwatch color={rt.color} kind="relationship" />
                {rt.display_label || rt.relationship_type}
              </label>
            </li>
          );
        })}
        {relationshipTypes.length === 0 && <li style={{ fontSize: 12, color: '#6b7378' }}>No relationship types observed yet.</li>}
      </ul>
    </div>
  );
}

RelationshipTypeFilter.propTypes = {
  relationshipTypes: PropTypes.array.isRequired,
  hiddenRelationshipTypes: PropTypes.array.isRequired,
  onChange: PropTypes.func.isRequired,
};
