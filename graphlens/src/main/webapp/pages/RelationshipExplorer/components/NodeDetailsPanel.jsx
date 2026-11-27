import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import NumberField from '@splunk/react-ui/Number';
import TextArea from '@splunk/react-ui/TextArea';
import { STATUS_COLORS, HIGH_RISK_THRESHOLD } from './GraphCanvas';

function fieldsFromNode(node) {
  return {
    label: node.label || '',
    type: node.type || '',
    group: node.group || '',
    description: node.description || '',
    riskScore: Number.isFinite(node.riskScore) ? node.riskScore : 0,
    eventCount: Number.isFinite(node.eventCount) ? node.eventCount : 0,
    sourceIndex: node.sourceIndex || '',
    sourceSourcetype: node.sourceSourcetype || '',
  };
}

export default function NodeDetailsPanel({
  node,
  isExpanded,
  isPinned,
  canEdit,
  onExpand,
  onCollapse,
  onHide,
  onPin,
  onUnpin,
  onViewEvidence,
  onSetPathEndpoint,
  onSaveEdit,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [fields, setFields] = useState(() => (node ? fieldsFromNode(node) : null));

  const nodeId = node ? node.id : null;
  // Deliberately keyed on nodeId alone, not the whole `node` object: a
  // fresh `node` reference arrives on every render once its own data
  // has been edited (NodeDetailsPanel re-reads it from graph state), so
  // depending on `node` itself would re-enter view mode and discard an
  // in-progress edit's unsaved fields the moment Save updates the very
  // node being edited. Switching to a *different* node (nodeId changes)
  // is the only case that should reset the form.
  useEffect(() => {
    setIsEditing(false);
    setFields(node ? fieldsFromNode(node) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  if (!node) {
    return (
      <div className="graphlens-section">
        <h3>Node details</h3>
        <p style={{ fontSize: 12, color: '#8a8a8a' }}>Select a node to see its properties.</p>
      </div>
    );
  }

  if (isEditing && fields) {
    return (
      <div className="graphlens-section">
        <h3>Edit node</h3>
        <p style={{ fontSize: 12, color: '#5c5c5c' }}>
          {node.id}
        </p>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Label
          <Text value={fields.label} onChange={(e, { value }) => setFields({ ...fields, label: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Type
          <Text value={fields.type} onChange={(e, { value }) => setFields({ ...fields, type: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Group
          <Text value={fields.group} onChange={(e, { value }) => setFields({ ...fields, group: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Risk score (0-100)
          <NumberField value={fields.riskScore} onChange={(e, { value }) => setFields({ ...fields, riskScore: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Event count
          <NumberField value={fields.eventCount} onChange={(e, { value }) => setFields({ ...fields, eventCount: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Description
          <TextArea value={fields.description} onChange={(e, { value }) => setFields({ ...fields, description: value })} rowsMin={2} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          Source index
          <Text value={fields.sourceIndex} onChange={(e, { value }) => setFields({ ...fields, sourceIndex: value })} />
        </label>
        <label style={{ fontSize: 12, display: 'block', marginBottom: 10 }}>
          Source sourcetype
          <Text value={fields.sourceSourcetype} onChange={(e, { value }) => setFields({ ...fields, sourceSourcetype: value })} />
        </label>
        <div className="graphlens-actions-row">
          <Button label="Save" appearance="primary" onClick={() => { onSaveEdit(node.id, fields); setIsEditing(false); }} />
          <Button label="Cancel" onClick={() => { setFields(fieldsFromNode(node)); setIsEditing(false); }} />
        </div>
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
        <dd style={(node.riskScore || 0) >= HIGH_RISK_THRESHOLD ? { color: STATUS_COLORS.risk, fontWeight: 600 } : undefined}>
          {node.riskScore}
        </dd>
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
        {canEdit && <Button label="Edit" onClick={() => { setFields(fieldsFromNode(node)); setIsEditing(true); }} />}
      </div>
    </div>
  );
}

NodeDetailsPanel.propTypes = {
  node: PropTypes.object,
  isExpanded: PropTypes.bool.isRequired,
  isPinned: PropTypes.bool.isRequired,
  canEdit: PropTypes.bool,
  onExpand: PropTypes.func.isRequired,
  onCollapse: PropTypes.func.isRequired,
  onHide: PropTypes.func.isRequired,
  onPin: PropTypes.func.isRequired,
  onUnpin: PropTypes.func.isRequired,
  onViewEvidence: PropTypes.func.isRequired,
  onSetPathEndpoint: PropTypes.func.isRequired,
  onSaveEdit: PropTypes.func,
};

NodeDetailsPanel.defaultProps = { node: null, canEdit: false, onSaveEdit: () => {} };
