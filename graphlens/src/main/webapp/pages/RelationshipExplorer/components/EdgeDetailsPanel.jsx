import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import NumberField from '@splunk/react-ui/Number';
import Switch from '@splunk/react-ui/Switch';
import List from '@splunk/react-icons/List';
import Pencil from '@splunk/react-icons/Pencil';
import { STATUS_COLORS, HIGH_RISK_THRESHOLD } from './GraphCanvas';

function fieldsFromEdge(edge) {
  return {
    relationship: edge.relationship || '',
    relationshipLabel: edge.relationshipLabel || '',
    directed: Boolean(edge.directed),
    riskScore: Number.isFinite(edge.riskScore) ? edge.riskScore : 0,
    eventCount: Number.isFinite(edge.eventCount) ? edge.eventCount : 0,
  };
}

export default function EdgeDetailsPanel({ edge, canEdit, onViewEvidence, onSaveEdit }) {
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState(() => (edge ? fieldsFromEdge(edge) : null));

  const edgeId = edge ? edge.id : null;
  // See NodeDetailsPanel.jsx's identical comment: keyed on edgeId alone
  // so saving an in-progress edit (which re-reads this same edge from
  // graph state, not a different one) does not itself reset the form.
  useEffect(() => {
    setIsEditing(false);
    setFields(edge ? fieldsFromEdge(edge) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeId]);

  if (!edge) {
    return (
      <div className="graphlens-section">
        <h3>Relationship details</h3>
        <p style={{ fontSize: 12, color: '#8a8a8a' }}>Select a relationship to see its properties.</p>
      </div>
    );
  }

  if (isEditing && fields) {
    return (
      <div className="graphlens-section">
        <h3>Edit relationship</h3>
        <div className="graphlens-entity-id">{edge.id}</div>
        <label className="graphlens-field">
          Relationship type
          <Text value={fields.relationship} onChange={(e, { value }) => setFields({ ...fields, relationship: value })} />
        </label>
        <label className="graphlens-field">
          Relationship label
          <Text value={fields.relationshipLabel} onChange={(e, { value }) => setFields({ ...fields, relationshipLabel: value })} />
        </label>
        <label className="graphlens-field">
          Risk score (0-100)
          <NumberField value={fields.riskScore} onChange={(e, { value }) => setFields({ ...fields, riskScore: value })} />
        </label>
        <label className="graphlens-field">
          Event count
          <NumberField value={fields.eventCount} onChange={(e, { value }) => setFields({ ...fields, eventCount: value })} />
        </label>
        <div style={{ marginBottom: 10 }}>
          <Switch selected={fields.directed} onClick={() => setFields({ ...fields, directed: !fields.directed })}>Directed</Switch>
        </div>
        <div className="graphlens-actions-grid graphlens-actions-grid-2">
          <Button label="Save" appearance="primary" onClick={() => { onSaveEdit(edge.id, fields); setIsEditing(false); }} inline={false} />
          <Button label="Cancel" onClick={() => { setFields(fieldsFromEdge(edge)); setIsEditing(false); }} inline={false} />
        </div>
      </div>
    );
  }

  // Same layout as NodeDetailsPanel.jsx's view mode (1.23.0).
  return (
    <div className="graphlens-section">
      <h3>Relationship details</h3>
      <div className="graphlens-entity-title">{edge.relationshipLabel}</div>
      <div className="graphlens-entity-id">{edge.id}</div>
      <dl className="graphlens-props">
        <dt>Source</dt>
        <dd>{edge.source}</dd>
        <dt>Target</dt>
        <dd>{edge.target}</dd>
        <dt>Directed</dt>
        <dd>{edge.directed ? 'Yes' : 'No'}</dd>
        <dt>Risk score</dt>
        <dd style={(edge.riskScore || 0) >= HIGH_RISK_THRESHOLD ? { color: STATUS_COLORS.risk, fontWeight: 600 } : undefined}>
          {edge.riskScore}
        </dd>
        <dt>Event count</dt>
        <dd>{edge.eventCount}</dd>
        {edge.firstSeen && (<><dt>First seen</dt><dd>{edge.firstSeen}</dd></>)}
        {edge.lastSeen && (<><dt>Last seen</dt><dd>{edge.lastSeen}</dd></>)}
      </dl>
      <div className="graphlens-actions-stack">
        <Button label="View supporting events" icon={<List />} appearance="primary" onClick={() => onViewEvidence(edge.id, 'edge')} inline={false} />
        {canEdit && <Button label="Edit" icon={<Pencil />} onClick={() => { setFields(fieldsFromEdge(edge)); setIsEditing(true); }} inline={false} />}
      </div>
    </div>
  );
}

EdgeDetailsPanel.propTypes = {
  edge: PropTypes.object,
  canEdit: PropTypes.bool,
  onViewEvidence: PropTypes.func.isRequired,
  onSaveEdit: PropTypes.func,
};

EdgeDetailsPanel.defaultProps = { edge: null, canEdit: false, onSaveEdit: () => {} };
