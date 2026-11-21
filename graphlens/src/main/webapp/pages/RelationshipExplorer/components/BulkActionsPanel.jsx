import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

/**
 * Actions applied to every node in the current multi-selection at once
 * (a Shift-drag box-select, or clicking a node type in the legend) -
 * each one just loops the identical single-node action
 * (pin/unpin/hide/expand) already used elsewhere, never a new code path.
 */
export default function BulkActionsPanel({ count, onPinAll, onUnpinAll, onHideAll, onExpandAll, onClear }) {
  return (
    <div className="graphlens-section">
      <h3 id="graphlens-bulk-actions-heading">{count} nodes selected</h3>
      <div className="graphlens-actions-row" aria-labelledby="graphlens-bulk-actions-heading">
        <Button label="Pin all" onClick={onPinAll} />
        <Button label="Unpin all" onClick={onUnpinAll} />
        <Button label="Hide all" onClick={onHideAll} />
        <Button label="Expand all" onClick={onExpandAll} />
        <Button label="Clear selection" onClick={onClear} />
      </div>
    </div>
  );
}

BulkActionsPanel.propTypes = {
  count: PropTypes.number.isRequired,
  onPinAll: PropTypes.func.isRequired,
  onUnpinAll: PropTypes.func.isRequired,
  onHideAll: PropTypes.func.isRequired,
  onExpandAll: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
};
