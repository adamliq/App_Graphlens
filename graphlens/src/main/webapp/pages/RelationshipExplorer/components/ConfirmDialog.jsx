import React, { useRef } from 'react';
import PropTypes from 'prop-types';
import useFocusOnOpen from './useFocusOnOpen';
import Modal from '@splunk/react-ui/Modal';
import Button from '@splunk/react-ui/Button';

/**
 * Generic "are you sure" guard in front of an action that replaces the
 * whole current graph (Reset graph, Import, Load from job) - all three
 * do so with no way back (loadGraphSnapshot/resetGraph never keep a
 * prior-state copy), and 1.19.0's on-canvas editing made that loss
 * concrete: an edit is itself session-only, so it is gone the moment
 * the graph it lives on is replaced, with nothing to re-export if the
 * user did not realise it yet (1.21.0). RelationshipExplorer/App.jsx
 * only opens this when the canvas already has at least one node - an
 * empty canvas has nothing to lose, so the action proceeds immediately
 * instead; see its confirmIfGraphHasContent helper.
 */
export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  const cancelRef = useRef(null);
  useFocusOnOpen(open, cancelRef);
  if (!open) return null;
  return (
    <Modal
      onRequestClose={onCancel}
      open={open}
      style={{ width: 420 }}
      // 1.25.0: focus starts on the useful control (useFocusOnOpen above),
      // not the header's Close (X); returnFocus is a no-op because App.jsx
      // returns focus to whatever opened the dialog once the last one closes.
      returnFocus={() => {}}
    >
      <Modal.Header title={title} onRequestClose={onCancel} />
      <Modal.Body>
        <p style={{ fontSize: 13 }}>{message}</p>
      </Modal.Body>
      <Modal.Footer>
        {/* Focused first: every use of this dialog guards a destructive action. */}
        <Button label="Cancel" appearance="secondary" onClick={onCancel} elementRef={cancelRef} />
        <Button label={confirmLabel} appearance="destructive" onClick={onConfirm} />
      </Modal.Footer>
    </Modal>
  );
}

ConfirmDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  title: PropTypes.string,
  message: PropTypes.string,
  confirmLabel: PropTypes.string,
  onConfirm: PropTypes.func,
  onCancel: PropTypes.func.isRequired,
};

ConfirmDialog.defaultProps = {
  title: '',
  message: '',
  confirmLabel: 'Continue',
  onConfirm: () => {},
};
