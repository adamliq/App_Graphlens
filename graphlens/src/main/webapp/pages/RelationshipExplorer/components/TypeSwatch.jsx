import React from 'react';
import PropTypes from 'prop-types';

/**
 * A small colour sample for a node or relationship type (1.24.0), shared
 * by the legend and the type filters. A node swatch takes the type's
 * canvas shape (via a `graphlens-shape-<name>` CSS class), so the legend
 * shows shape as well as colour - the canvas no longer relies on colour
 * alone to tell types apart (WCAG 1.4.1). A relationship swatch is a short
 * line, so node types and relationship types can't be mistaken for each
 * other either.
 */
export default function TypeSwatch({ color, shape, kind }) {
  const className = kind === 'relationship'
    ? 'graphlens-type-swatch graphlens-type-swatch-line'
    : `graphlens-type-swatch graphlens-shape-${shape || 'ellipse'}`;
  return <span className={className} style={{ backgroundColor: color }} aria-hidden="true" />;
}

TypeSwatch.propTypes = {
  color: PropTypes.string.isRequired,
  shape: PropTypes.string,
  kind: PropTypes.oneOf(['node', 'relationship']),
};

TypeSwatch.defaultProps = { shape: 'ellipse', kind: 'node' };
