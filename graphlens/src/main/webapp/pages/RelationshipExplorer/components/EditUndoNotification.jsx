import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

/**
 * Single-level "undo my last edit" banner (1.21.0) - appears right
 * after NodeDetailsPanel/EdgeDetailsPanel's edit mode saves a change,
 * mirroring ErrorNotification.jsx's shape but for a neutral, not an
 * error, outcome. Only one edit back is kept (App.jsx's `lastEdit`
 * state holds exactly one `{kind, id, previousData, label}` snapshot,
 * overwritten by the next edit) - this is a quick "oops" recovery, not
 * a full undo history. Clicking Undo (or Dismiss) clears it either way.
 */
export default function EditUndoNotification({ lastEdit, onUndo, onDismiss }) {
  if (!lastEdit) return null;
  return (
    <div className="graphlens-info-banner" role="status">
      <span>
        Edited &quot;{lastEdit.label}&quot;.
      </span>
      <Button label="Undo" appearance="subtle" onClick={onUndo} style={{ marginLeft: 12 }} />
      <Button label="Dismiss" appearance="subtle" onClick={onDismiss} style={{ marginLeft: 4 }} />
    </div>
  );
}

EditUndoNotification.propTypes = {
  lastEdit: PropTypes.shape({ label: PropTypes.string }),
  onUndo: PropTypes.func.isRequired,
  onDismiss: PropTypes.func.isRequired,
};

EditUndoNotification.defaultProps = { lastEdit: null };
