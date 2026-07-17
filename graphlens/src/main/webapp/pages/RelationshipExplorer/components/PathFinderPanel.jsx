import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Select from '@splunk/react-ui/Select';

/**
 * Client-side shortest-path finder over the graph currently loaded in the
 * browser. Deliberately worded so it is never confused with an
 * unrestricted graph-database query (section 14 requirement).
 */
export default function PathFinderPanel({ nodes, startNodeId, endNodeId, onSetStart, onSetEnd, onFindPath, onClearPath, path }) {
  const [localError, setLocalError] = useState(null);

  const handleFind = () => {
    if (!startNodeId || !endNodeId) {
      setLocalError('Choose a start and end node first.');
      return;
    }
    setLocalError(null);
    const result = onFindPath();
    if (!result) {
      setLocalError('No path was found between those nodes within the visible graph and the configured maximum path depth.');
    }
  };

  return (
    <div className="graphlens-section">
      <h3 id="graphlens-pathfinder-heading">Path finder (visible graph only)</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} aria-labelledby="graphlens-pathfinder-heading">
        <label htmlFor="graphlens-path-start" style={{ fontSize: 12 }}>
          Start node
          <Select inputId="graphlens-path-start" value={startNodeId || ''} onChange={(e, { value }) => onSetStart(value)}>
            {nodes.map((n) => <Select.Option key={n.id} label={n.label} value={n.id} />)}
          </Select>
        </label>
        <label htmlFor="graphlens-path-end" style={{ fontSize: 12 }}>
          End node
          <Select inputId="graphlens-path-end" value={endNodeId || ''} onChange={(e, { value }) => onSetEnd(value)}>
            {nodes.map((n) => <Select.Option key={n.id} label={n.label} value={n.id} />)}
          </Select>
        </label>
        <div className="graphlens-actions-row">
          <Button label="Find shortest path" appearance="primary" onClick={handleFind} />
          {path && <Button label="Clear path" onClick={onClearPath} />}
        </div>
        {localError && <p style={{ fontSize: 12, color: '#7a1f1f' }}>{localError}</p>}
        {path && (
          <p style={{ fontSize: 12 }}>
            Path found: {path.nodeIds.length} nodes, {path.edgeIds.length} hops.
          </p>
        )}
      </div>
    </div>
  );
}

PathFinderPanel.propTypes = {
  nodes: PropTypes.array.isRequired,
  startNodeId: PropTypes.string,
  endNodeId: PropTypes.string,
  onSetStart: PropTypes.func.isRequired,
  onSetEnd: PropTypes.func.isRequired,
  onFindPath: PropTypes.func.isRequired,
  onClearPath: PropTypes.func.isRequired,
  path: PropTypes.shape({ nodeIds: PropTypes.array, edgeIds: PropTypes.array }),
};

PathFinderPanel.defaultProps = { startNodeId: null, endNodeId: null, path: null };
