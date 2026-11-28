import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import Popover from '@splunk/react-ui/Popover';
import Menu from '@splunk/react-ui/Menu';
import List from '@splunk/react-icons/List';
import { focusFirstMenuItem, handleMenuArrowKeys } from './menuKeyboard';

/**
 * Right-click (Cytoscape's `cxttap`) menu for an edge - the counterpart
 * to NodeContextMenu.jsx, 1.21.0. Deliberately a single item: View
 * supporting events is the only action EdgeDetailsPanel itself offers
 * besides Edit (which needs the graphlens_edit_graph_data capability
 * and stays a details-panel-only action, same as it does for a node's
 * context menu). GraphCanvas.jsx owns this component's open/closed
 * state and anchor point; the action here is the exact same
 * onViewEvidence handler App.jsx already passes to EdgeDetailsPanel.
 */
export default function EdgeContextMenu({ open, anchor, edge, onRequestClose, onViewEvidence }) {
  useEffect(() => {
    if (open) focusFirstMenuItem('.graphlens-context-menu');
  }, [open]);

  if (!edge) return null;

  return (
    <Popover
      open={open}
      anchor={anchor}
      defaultPlacement="below"
      align="edge"
      onRequestClose={onRequestClose}
      appearance="normal"
      hideArrow
      takeFocus
    >
      {/* Same framed, iconised styling as NodeContextMenu.jsx (1.23.0). */}
      <Menu className="graphlens-context-menu" onKeyDown={handleMenuArrowKeys}>
        <Menu.Heading title={edge.relationshipLabel}>{edge.relationshipLabel}</Menu.Heading>
        <Menu.Divider />
        <Menu.Item
          startAdornment={<List />}
          onClick={() => {
            onViewEvidence(edge.id, 'edge');
            onRequestClose();
          }}
        >
          View supporting events
        </Menu.Item>
      </Menu>
    </Popover>
  );
}

EdgeContextMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  anchor: PropTypes.object,
  edge: PropTypes.object,
  onRequestClose: PropTypes.func.isRequired,
  onViewEvidence: PropTypes.func.isRequired,
};

EdgeContextMenu.defaultProps = {
  anchor: null,
  edge: null,
};
