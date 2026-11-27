import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import NumberField from '@splunk/react-ui/Number';
import TextArea from '@splunk/react-ui/TextArea';
import PlusCircle from '@splunk/react-icons/PlusCircle';
import MinusCircle from '@splunk/react-icons/MinusCircle';
import Pin from '@splunk/react-icons/Pin';
import PinStuck from '@splunk/react-icons/PinStuck';
import EyeSlashed from '@splunk/react-icons/EyeSlashed';
import List from '@splunk/react-icons/List';
import NodeStartToEnd from '@splunk/react-icons/NodeStartToEnd';
import Pencil from '@splunk/react-icons/Pencil';
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
        <div className="graphlens-entity-id">{node.id}</div>
        <label className="graphlens-field">
          Label
          <Text value={fields.label} onChange={(e, { value }) => setFields({ ...fields, label: value })} />
        </label>
        <label className="graphlens-field">
          Type
          <Text value={fields.type} onChange={(e, { value }) => setFields({ ...fields, type: value })} />
        </label>
        <label className="graphlens-field">
          Group
          <Text value={fields.group} onChange={(e, { value }) => setFields({ ...fields, group: value })} />
        </label>
        <label className="graphlens-field">
          Risk score (0-100)
          <NumberField value={fields.riskScore} onChange={(e, { value }) => setFields({ ...fields, riskScore: value })} />
        </label>
        <label className="graphlens-field">
          Event count
          <NumberField value={fields.eventCount} onChange={(e, { value }) => setFields({ ...fields, eventCount: value })} />
        </label>
        <label className="graphlens-field">
          Description
          <TextArea value={fields.description} onChange={(e, { value }) => setFields({ ...fields, description: value })} rowsMin={2} />
        </label>
        <label className="graphlens-field">
          Source index
          <Text value={fields.sourceIndex} onChange={(e, { value }) => setFields({ ...fields, sourceIndex: value })} />
        </label>
        <label className="graphlens-field">
          Source sourcetype
          <Text value={fields.sourceSourcetype} onChange={(e, { value }) => setFields({ ...fields, sourceSourcetype: value })} />
        </label>
        <div className="graphlens-actions-grid graphlens-actions-grid-2">
          <Button label="Save" appearance="primary" onClick={() => { onSaveEdit(node.id, fields); setIsEditing(false); }} inline={false} />
          <Button label="Cancel" onClick={() => { setFields(fieldsFromNode(node)); setIsEditing(false); }} inline={false} />
        </div>
      </div>
    );
  }

  // 1.23.0: the title/id sit above a two-column property grid (label |
  // value) instead of a browser-default <dl> that put every value on its
  // own indented line; actions are laid out as one primary button, the
  // two long investigate actions full width, then a row of three short
  // ones - instead of a wrapping row of mixed-width buttons.
  return (
    <div className="graphlens-section">
      <h3>Node details</h3>
      <div className="graphlens-entity-title">{node.label}</div>
      <div className="graphlens-entity-id">{node.id}</div>
      <dl className="graphlens-props">
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
      <div className="graphlens-actions-stack">
        {!isExpanded ? (
          <Button label="Expand" icon={<PlusCircle />} onClick={() => onExpand(node.id)} appearance="primary" inline={false} />
        ) : (
          <Button label="Collapse" icon={<MinusCircle />} onClick={() => onCollapse(node.id)} inline={false} />
        )}
        <Button label="View supporting events" icon={<List />} onClick={() => onViewEvidence(node.id, 'node')} inline={false} />
        <Button label="Use as path endpoint" icon={<NodeStartToEnd />} onClick={() => onSetPathEndpoint(node.id)} inline={false} />
        <div className="graphlens-actions-grid">
          {isPinned ? (
            <Button label="Unpin" icon={<PinStuck />} onClick={() => onUnpin(node.id)} inline={false} />
          ) : (
            <Button label="Pin" icon={<Pin />} onClick={() => onPin(node.id)} inline={false} />
          )}
          <Button label="Hide" icon={<EyeSlashed />} onClick={() => onHide(node.id)} inline={false} />
          {canEdit && <Button label="Edit" icon={<Pencil />} onClick={() => { setFields(fieldsFromNode(node)); setIsEditing(true); }} inline={false} />}
        </div>
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
