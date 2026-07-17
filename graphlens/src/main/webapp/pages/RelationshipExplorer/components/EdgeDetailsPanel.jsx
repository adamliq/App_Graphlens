import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

export default function EdgeDetailsPanel({ edge, onViewEvidence }) {
  if (!edge) {
    return (
      <div className="graphlens-section">
        <h3>Relationship details</h3>
        <p style={{ fontSize: 12, color: '#8a8a8a' }}>Select a relationship to see its properties.</p>
      </div>
    );
  }

  return (
    <div className="graphlens-section">
      <h3>Relationship details</h3>
      <dl style={{ fontSize: 13, margin: 0 }}>
        <dt style={{ fontWeight: 600 }}>{edge.relationshipLabel}</dt>
        <dd style={{ margin: '2px 0 8px 0', color: '#5c5c5c' }}>{edge.id}</dd>
        <dt>Source</dt>
        <dd>{edge.source}</dd>
        <dt>Target</dt>
        <dd>{edge.target}</dd>
        <dt>Directed</dt>
        <dd>{edge.directed ? 'Yes' : 'No'}</dd>
        <dt>Risk score</dt>
        <dd>{edge.riskScore}</dd>
        <dt>Event count</dt>
        <dd>{edge.eventCount}</dd>
        {edge.firstSeen && (<><dt>First seen</dt><dd>{edge.firstSeen}</dd></>)}
        {edge.lastSeen && (<><dt>Last seen</dt><dd>{edge.lastSeen}</dd></>)}
      </dl>
      <div className="graphlens-actions-row">
        <Button label="View supporting events" appearance="primary" onClick={() => onViewEvidence(edge.id, 'edge')} />
      </div>
    </div>
  );
}

EdgeDetailsPanel.propTypes = {
  edge: PropTypes.object,
  onViewEvidence: PropTypes.func.isRequired,
};

EdgeDetailsPanel.defaultProps = { edge: null };
