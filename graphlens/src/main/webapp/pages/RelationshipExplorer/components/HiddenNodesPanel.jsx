import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';
import Eye from '@splunk/react-icons/Eye';

/**
 * Lists nodes hidden with Hide (1.25.0) with a Show button for each and a
 * Show all. Before this, the only way to bring a hidden node back was
 * Reset graph, which discarded the whole investigation - the reducer had
 * an unhideNode action that nothing in the UI called. Rendered inside a
 * SidebarSection only while at least one node is hidden.
 */
export default function HiddenNodesPanel({ nodes, onShow, onShowAll }) {
  return (
    <div className="graphlens-section">
      <ul className="graphlens-hidden-list">
        {nodes.map((n) => (
          <li key={n.id}>
            <span className="graphlens-hidden-label" title={n.id}>{n.label || n.id}</span>
            <Button label="Show" appearance="secondary" icon={<Eye />} onClick={() => onShow(n.id)} aria-label={`Show ${n.label || n.id}`} />
          </li>
        ))}
      </ul>
      {nodes.length > 1 && (
        <div className="graphlens-actions-row">
          <Button label="Show all" appearance="secondary" icon={<Eye />} onClick={onShowAll} />
        </div>
      )}
    </div>
  );
}

HiddenNodesPanel.propTypes = {
  nodes: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.string.isRequired, label: PropTypes.string })).isRequired,
  onShow: PropTypes.func.isRequired,
  onShowAll: PropTypes.func.isRequired,
};
