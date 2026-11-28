import React, { useEffect } from 'react';
import PropTypes from 'prop-types';
import Popover from '@splunk/react-ui/Popover';
import Menu from '@splunk/react-ui/Menu';
import PlusCircle from '@splunk/react-icons/PlusCircle';
import MinusCircle from '@splunk/react-icons/MinusCircle';
import Pin from '@splunk/react-icons/Pin';
import PinStuck from '@splunk/react-icons/PinStuck';
import EyeSlashed from '@splunk/react-icons/EyeSlashed';
import NodesCentered from '@splunk/react-icons/NodesCentered';
import List from '@splunk/react-icons/List';
import NodeStartToEnd from '@splunk/react-icons/NodeStartToEnd';
import { focusFirstMenuItem, handleMenuArrowKeys } from './menuKeyboard';

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
  onSetPathStart,
  onSetPathEnd,
  onCenter,
}) {
  useEffect(() => {
    if (open) focusFirstMenuItem('.graphlens-context-menu');
  }, [open]);

  if (!node) return null;

  const act = (fn) => () => {
    fn(node.id);
    onRequestClose();
  };

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
      {/*
        1.23.0: "normal" appearance (border, rounded corners, shadow)
        instead of "none", which left the menu as a borderless white box
        on the near-white canvas. Items are grouped - graph actions, view
        actions, investigate - each with an icon matching the toolbar's.
      */}
      <Menu className="graphlens-context-menu" onKeyDown={handleMenuArrowKeys}>
        <Menu.Heading title={node.label}>{node.label}</Menu.Heading>
        <Menu.Divider />
        {isExpanded ? (
          <Menu.Item startAdornment={<MinusCircle />} onClick={act(onCollapse)}>Collapse</Menu.Item>
        ) : (
          <Menu.Item startAdornment={<PlusCircle />} onClick={act(onExpand)}>Expand</Menu.Item>
        )}
        {isPinned ? (
          <Menu.Item startAdornment={<PinStuck />} onClick={act(onUnpin)}>Unpin</Menu.Item>
        ) : (
          <Menu.Item startAdornment={<Pin />} onClick={act(onPin)}>Pin</Menu.Item>
        )}
        <Menu.Item startAdornment={<EyeSlashed />} onClick={act(onHide)}>Hide</Menu.Item>
        <Menu.Divider />
        <Menu.Divider />
        <Menu.Item startAdornment={<List />} onClick={act((id) => onViewEvidence(id, 'node'))}>View supporting events</Menu.Item>
        <Menu.Divider />
        {/*
          1.25.0: two explicit actions replace "Use as path endpoint", which
          set the start the first time and the end every time after - the
          label never said which. Setting the second end runs the path
          search (see App.jsx).
        */}
        <Menu.Item startAdornment={<NodeStartToEnd />} onClick={act(onSetPathStart)}>Path from here</Menu.Item>
        <Menu.Item startAdornment={<NodeStartToEnd />} onClick={act(onSetPathEnd)}>Path to here</Menu.Item>
        <Menu.Divider />
        <Menu.Item startAdornment={<NodesCentered />} onClick={act(onCenter)}>Centre on selection</Menu.Item>
      </Menu>
    </Popover>
  );
}

NodeContextMenu.propTypes = {
  open: PropTypes.bool.isRequired,
  anchor: PropTypes.object,
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
  onSetPathStart: PropTypes.func.isRequired,
  onSetPathEnd: PropTypes.func.isRequired,
  onCenter: PropTypes.func.isRequired,
};

NodeContextMenu.defaultProps = {
  anchor: null,
  node: null,
};
