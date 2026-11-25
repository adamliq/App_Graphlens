import React from 'react';
import PropTypes from 'prop-types';
import Popover from '@splunk/react-ui/Popover';
import Menu from '@splunk/react-ui/Menu';

/**
 * Right-click (Cytoscape's `cxttap`) menu for a node - GraphCanvas.jsx
 * wires the event and owns this component's open/closed state and
 * anchor point; every action here is the exact same handler
 * RelationshipExplorer/App.jsx already passes to NodeDetailsPanel, so a
 * right-click is a quicker way to reach an action already available
 * from the Details panel, not a second implementation of any of them.
 * No capability gating: every action offered here is already available
 * to any viewer-tier user from the Details panel with no capability
 * check of its own.
 */
export default function NodeContextMenu({
  open,
  anchor,
  point,
  node,
  isExpanded,
  isPinned,
  onRequestClose,
  onExpand,
  onCollapse,
  onHide,
  onPin,
  onUnpin,
  onViewEvidence,
  onSetPathEndpoint,
  onCenter,
}) {
  if (!node) return null;

  const act = (fn) => () => {
    fn(node.id);
    onRequestClose();
  };

  return (
    <Popover
      open={open}
      anchor={anchor}
      pointTo={point}
      onRequestClose={onRequestClose}
      appearance="none"
    >
      <Menu>
        <Menu.Heading>{node.label}</Menu.Heading>
        <Menu.Divider />
        {isExpanded ? (
          <Menu.Item onClick={act(onCollapse)}>Collapse</Menu.Item>
        ) : (
          <Menu.Item onClick={act(onExpand)}>Expand</Menu.Item>
        )}
        {isPinned ? (
          <Menu.Item onClick={act(onUnpin)}>Unpin</Menu.Item>
        ) : (
          <Menu.Item onClick={act(onPin)}>Pin</Menu.Item>
        )}
        <Menu.Item onClick={act(onHide)}>Hide</Menu.Item>
        <Menu.Item onClick={act(onCenter)}>Centre on screen</Menu.Item>
        <Menu.Item onClick={act((id) => onViewEvidence(id, 'node'))}>View supporting events</Menu.Item>
        <Menu.Item onClick={act(onSetPathEndpoint)}>Use as path endpoint</Menu.Item>
      </Menu>
    </Popover>
  );
}

NodeContextMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  anchor: PropTypes.object,
  point: PropTypes.shape({ x: PropTypes.number, y: PropTypes.number }),
  node: PropTypes.object,
  isExpanded: PropTypes.bool.isRequired,
  isPinned: PropTypes.bool.isRequired,
  onRequestClose: PropTypes.func.isRequired,
  onExpand: PropTypes.func.isRequired,
  onCollapse: PropTypes.func.isRequired,
  onHide: PropTypes.func.isRequired,
  onPin: PropTypes.func.isRequired,
  onUnpin: PropTypes.func.isRequired,
  onViewEvidence: PropTypes.func.isRequired,
  onSetPathEndpoint: PropTypes.func.isRequired,
  onCenter: PropTypes.func.isRequired,
};

NodeContextMenu.defaultProps = {
  anchor: null,
  point: undefined,
  node: null,
};
