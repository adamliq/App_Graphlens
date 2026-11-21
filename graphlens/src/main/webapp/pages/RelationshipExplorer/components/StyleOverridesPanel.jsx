import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';

/**
 * Lets you restyle a node/relationship type's colour for this browser
 * session only - never written anywhere (not to the curated KV Store
 * collections an administrator maintains, not to browser storage), so it
 * never affects any other user or survives a reload. A convenience for
 * visually emphasising something while investigating, not a replacement
 * for the Configuration page's curated type colours.
 */
export default function StyleOverridesPanel({
  nodeTypes, relationshipTypes, nodeOverrides, relationshipOverrides,
  onSetNodeColor, onSetRelationshipColor, onClearNodeColor, onClearRelationshipColor,
}) {
  const [selectedNodeType, setSelectedNodeType] = useState('');
  const [pendingNodeColor, setPendingNodeColor] = useState('#5a2be2');
  const [selectedRelType, setSelectedRelType] = useState('');
  const [pendingRelColor, setPendingRelColor] = useState('#5a2be2');

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-style-overrides-heading">Colours (this session only)</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} aria-labelledby="graphlens-style-overrides-heading">
        <label htmlFor="graphlens-style-node-type" style={{ fontSize: 12 }}>
          Node type
          <Select inputId="graphlens-style-node-type" value={selectedNodeType} onChange={(e, { value }) => setSelectedNodeType(value)}>
            {nodeTypes.map((nt) => <Select.Option key={nt.node_type} label={nt.display_label || nt.node_type} value={nt.node_type} />)}
          </Select>
        </label>
        <div className="graphlens-actions-row">
          <input type="color" aria-label="Node type colour" value={pendingNodeColor} onChange={(e) => setPendingNodeColor(e.target.value)} />
          <Button label="Apply" disabled={!selectedNodeType} onClick={() => onSetNodeColor(selectedNodeType, pendingNodeColor)} />
        </div>
        {Object.keys(nodeOverrides).length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12 }}>
            {Object.entries(nodeOverrides).map(([type, color]) => (
              <li key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span className="graphlens-legend-swatch" style={{ backgroundColor: color }} />
                <span style={{ flex: 1 }}>{type}</span>
                <Button label="Reset" onClick={() => onClearNodeColor(type)} />
              </li>
            ))}
          </ul>
        )}

        <label htmlFor="graphlens-style-rel-type" style={{ fontSize: 12, marginTop: 8 }}>
          Relationship type
          <Select inputId="graphlens-style-rel-type" value={selectedRelType} onChange={(e, { value }) => setSelectedRelType(value)}>
            {relationshipTypes.map((rt) => <Select.Option key={rt.relationship_type} label={rt.display_label || rt.relationship_type} value={rt.relationship_type} />)}
          </Select>
        </label>
        <div className="graphlens-actions-row">
          <input type="color" aria-label="Relationship type colour" value={pendingRelColor} onChange={(e) => setPendingRelColor(e.target.value)} />
          <Button label="Apply" disabled={!selectedRelType} onClick={() => onSetRelationshipColor(selectedRelType, pendingRelColor)} />
        </div>
        {Object.keys(relationshipOverrides).length > 0 && (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12 }}>
            {Object.entries(relationshipOverrides).map(([type, color]) => (
              <li key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span className="graphlens-legend-swatch" style={{ backgroundColor: color, borderRadius: '50%' }} />
                <span style={{ flex: 1 }}>{type}</span>
                <Button label="Reset" onClick={() => onClearRelationshipColor(type)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

StyleOverridesPanel.propTypes = {
  nodeTypes: PropTypes.array.isRequired,
  relationshipTypes: PropTypes.array.isRequired,
  nodeOverrides: PropTypes.object.isRequired,
  relationshipOverrides: PropTypes.object.isRequired,
  onSetNodeColor: PropTypes.func.isRequired,
  onSetRelationshipColor: PropTypes.func.isRequired,
  onClearNodeColor: PropTypes.func.isRequired,
  onClearRelationshipColor: PropTypes.func.isRequired,
};
