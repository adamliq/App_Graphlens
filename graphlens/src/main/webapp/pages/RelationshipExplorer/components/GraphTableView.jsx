import React from 'react';
import PropTypes from 'prop-types';

const NODE_COLUMNS = ['id', 'label', 'type', 'group', 'riskScore', 'eventCount', 'firstSeen', 'lastSeen'];
const EDGE_COLUMNS = ['id', 'source', 'target', 'relationship', 'relationshipLabel', 'directed', 'riskScore', 'eventCount', 'firstSeen', 'lastSeen'];

function DataTable({ rows, columns }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: '#8a8a8a' }}>None currently visible.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="graphlens-data-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c} style={{ whiteSpace: 'nowrap' }}>{String(row[c] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

DataTable.propTypes = { rows: PropTypes.array.isRequired, columns: PropTypes.array.isRequired };

/**
 * A plain-table alternative to the canvas, over the identical node/edge
 * data the diagram renders - the same `renderable.nodes`/`renderable.edges`
 * (already passed through every active filter), so the two views never
 * disagree about what is currently "in" the graph. Read-only: selecting,
 * expanding, pinning etc. remain canvas-only actions; this is a different
 * way to look at the same data, not a second way to interact with it.
 */
export default function GraphTableView({ nodes, edges }) {
  return (
    <div className="graphlens-canvas-table">
      <h3 style={{ marginTop: 0 }}>Nodes ({nodes.length})</h3>
      <DataTable rows={nodes} columns={NODE_COLUMNS} />
      <h3>Relationships ({edges.length})</h3>
      <DataTable rows={edges} columns={EDGE_COLUMNS} />
    </div>
  );
}

GraphTableView.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
};
