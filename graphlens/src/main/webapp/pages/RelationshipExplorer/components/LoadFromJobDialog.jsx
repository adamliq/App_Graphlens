import React, { useState } from 'react';
import PropTypes from 'prop-types';
import Modal from '@splunk/react-ui/Modal';
import Button from '@splunk/react-ui/Button';
import Text from '@splunk/react-ui/Text';
import WaitSpinner from '@splunk/react-ui/WaitSpinner';

export default function LoadFromJobDialog({ open, isLoading, error, onClose, onLoad }) {
  const [sid, setSid] = useState('');

  if (!open) return null;

  return (
    <Modal onRequestClose={onClose} open={open} style={{ width: 460 }}>
      <Modal.Header title="Load from job" onRequestClose={onClose} />
      <Modal.Body>
        <p style={{ fontSize: 13 }}>
          Loads the results of a search job you (or someone who shared it
          with you) already ran - in Splunk Web&apos;s own Search app, for
          example - replacing the current graph. This does not run a new
          search; it only reads a job that already exists, so it cannot
          show you anything that job&apos;s own search permissions
          wouldn&apos;t already have let you see. The job&apos;s results
          must already be shaped to the relationship schema (see the Help
          page) - a one-hop expansion&apos;s edge rows, a plain entity
          list&apos;s node rows, or a mix of both; rows matching neither
          shape are silently skipped. A job only exists for a limited time
          after it finishes (Splunk&apos;s own default is a few minutes
          unless it has been pinned or scheduled) - this only works while
          it still does.
        </p>
        <label htmlFor="graphlens-job-id" style={{ fontSize: 12 }}>
          Job ID (sid)
          <Text
            inputId="graphlens-job-id"
            value={sid}
            disabled={isLoading}
            onChange={(e, { value }) => setSid(value)}
            placeholder="e.g. 1795637807.16"
          />
        </label>
        {isLoading && <WaitSpinner size="small" />}
        {error && (
          <div className="graphlens-error-banner" role="status">
            {error}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button label="Cancel" onClick={onClose} appearance="secondary" disabled={isLoading} />
        <Button label="Load" appearance="primary" onClick={() => onLoad(sid)} disabled={isLoading || sid.trim().length === 0} />
      </Modal.Footer>
    </Modal>
  );
}

LoadFromJobDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  isLoading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  onClose: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
};

LoadFromJobDialog.defaultProps = {
  error: null,
};
