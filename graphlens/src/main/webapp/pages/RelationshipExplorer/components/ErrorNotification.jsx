import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

export default function ErrorNotification({ error, onDismiss }) {
  if (!error) return null;
  return (
    <div className="graphlens-error-banner" role="alert">
      <span>{error.message}</span>
      <Button label="Dismiss" appearance="subtle" onClick={onDismiss} style={{ marginLeft: 12 }} />
    </div>
  );
}

ErrorNotification.propTypes = {
  error: PropTypes.shape({ message: PropTypes.string }),
  onDismiss: PropTypes.func.isRequired,
};

ErrorNotification.defaultProps = { error: null };
