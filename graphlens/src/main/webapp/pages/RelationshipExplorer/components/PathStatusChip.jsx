import React from 'react';
import PropTypes from 'prop-types';
import Button from '@splunk/react-ui/Button';

/**
 * Path status shown on the graph itself (1.25.0), next to what it is
 * about, instead of only in the Path finder sidebar section - which was
 * collapsed by default and, once opened, left its Find button below the
 * fold. Announced politely to screen readers.
 *   - only a start chosen: says so and what to do next
 *   - only an end chosen:  likewise
 *   - both, path found:    "Path: n nodes, h hops"
 *   - both, no path:       why there might not be one
 */
export default function PathStatusChip({ startLabel, endLabel, searched, path, maxDepth, onClear }) {
  if (!startLabel && !endLabel) return null;
  let text;
  if (startLabel && !endLabel) text = `Path from "${startLabel}" - choose "Path to here" on another node.`;
  else if (!startLabel && endLabel) text = `Path to "${endLabel}" - choose "Path from here" on another node.`;
  else if (!searched) text = `Finding a path from "${startLabel}" to "${endLabel}"...`;
  else if (path) text = `Path from "${startLabel}" to "${endLabel}": ${path.nodeIds.length} nodes, ${path.edgeIds.length} hops.`;
  else text = `No path from "${startLabel}" to "${endLabel}" within ${maxDepth} hops on the visible graph.`;
  return (
    <div className={path ? 'graphlens-path-chip graphlens-path-chip-found' : 'graphlens-path-chip'} role="status" aria-live="polite">
      <span>{text}</span>
      <Button label="Clear" appearance="secondary" onClick={onClear} aria-label="Clear path" />
    </div>
  );
}

PathStatusChip.propTypes = {
  startLabel: PropTypes.string,
  endLabel: PropTypes.string,
  searched: PropTypes.bool,
  path: PropTypes.shape({ nodeIds: PropTypes.array, edgeIds: PropTypes.array }),
  maxDepth: PropTypes.number,
  onClear: PropTypes.func.isRequired,
};

PathStatusChip.defaultProps = { startLabel: null, endLabel: null, searched: false, path: null, maxDepth: 5 };
