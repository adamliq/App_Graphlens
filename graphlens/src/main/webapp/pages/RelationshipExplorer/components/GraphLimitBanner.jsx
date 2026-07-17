import React from 'react';
import PropTypes from 'prop-types';

export default function GraphLimitBanner({ visible, nodeCount, maxVisibleNodes, edgeCount, maxVisibleEdges }) {
  if (!visible) return null;
  return (
    <div className="graphlens-limit-banner" role="status">
      Graph size limit reached ({nodeCount}/{maxVisibleNodes} nodes, {edgeCount}/{maxVisibleEdges} edges).
      Some results were not added. Narrow the time range or filters, or ask an administrator to raise the limit
      in Configuration.
    </div>
  );
}

GraphLimitBanner.propTypes = {
  visible: PropTypes.bool.isRequired,
  nodeCount: PropTypes.number.isRequired,
  maxVisibleNodes: PropTypes.number.isRequired,
  edgeCount: PropTypes.number.isRequired,
  maxVisibleEdges: PropTypes.number.isRequired,
};
