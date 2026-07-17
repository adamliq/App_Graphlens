import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

export default function NodeDetailsPanel({
  node,
  isExpanded,
  isPinned,
  onExpand,
  onCollapse,
  onHide,
  onPin,
  onUnpin,
  onViewEvidence,
  onSetPathEndpoint,
}) {
  if (!node) {
    return (
      <div className="graphlens-section">
        <h3>Node details</h3>
        <p style={{ fontSize: 12, color: '#8a8a8a' }}>Select a node to see its properties.</p>
      </div>
    );
  }

  return (
    <div className="graphlens-section">
      <h3>Node details</h3>
      <dl style={{ fontSize: 13, margin: 0 }}>
        <dt style={{ fontWeight: 600 }}>{node.label}</dt>
        <dd style={{ margin: '2px 0 8px 0', color: '#5c5c5c' }}>{node.id}</dd>
        <dt>Type</dt>
        <dd>{node.type}</dd>
        {node.group && (<><dt>Group</dt><dd>{node.group}</dd></>)}
        <dt>Risk score</dt>
        <dd>{node.riskScore}</dd>
        <dt>Event count</dt>
        <dd>{node.eventCount}</dd>
        {node.firstSeen && (<><dt>First seen</dt><dd>{node.firstSeen}</dd></>)}
        {node.lastSeen && (<><dt>Last seen</dt><dd>{node.lastSeen}</dd></>)}
        {node.description && (<><dt>Description</dt><dd>{node.description}</dd></>)}
        {node.sourceIndex && (<><dt>Source index</dt><dd>{node.sourceIndex}</dd></>)}
        {node.sourceSourcetype && (<><dt>Source sourcetype</dt><dd>{node.sourceSourcetype}</dd></>)}
      </dl>
      <div className="graphlens-actions-row">
        {!isExpanded ? (
          <Button label="Expand" onClick={() => onExpand(node.id)} appearance="primary" />
        ) : (
          <Button label="Collapse" onClick={() => onCollapse(node.id)} />
        )}
        <Button label="Hide" onClick={() => onHide(node.id)} />
        {isPinned ? (
          <Button label="Unpin" onClick={() => onUnpin(node.id)} />
        ) : (
          <Button label="Pin" onClick={() => onPin(node.id)} />
        )}
        <Button label="View supporting events" onClick={() => onViewEvidence(node.id, 'node')} />
        <Button label="Use as path endpoint" onClick={() => onSetPathEndpoint(node.id)} />
      </div>
    </div>
  );
}

NodeDetailsPanel.propTypes = {
  node: PropTypes.object,
  isExpanded: PropTypes.bool.isRequired,
  isPinned: PropTypes.bool.isRequired,
  onExpand: PropTypes.func.isRequired,
  onCollapse: PropTypes.func.isRequired,
  onHide: PropTypes.func.isRequired,
  onPin: PropTypes.func.isRequired,
  onUnpin: PropTypes.func.isRequired,
  onViewEvidence: PropTypes.func.isRequired,
  onSetPathEndpoint: PropTypes.func.isRequired,
};

NodeDetailsPanel.defaultProps = { node: null };
