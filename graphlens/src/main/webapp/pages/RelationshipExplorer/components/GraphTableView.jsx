import React from 'react';
import PropTypes from 'prop-types';

const NODE_COLUMNS = ['id', 'label', 'type', 'group', 'riskScore', 'eventCount', 'firstSeen', 'lastSeen'];
const EDGE_COLUMNS = ['id', 'source', 'target', 'relationship', 'relationshipLabel', 'directed', 'riskScore', 'eventCount', 'firstSeen', 'lastSeen'];

/**
 * 1.25.0: rows are selectable. The first cell is a real button (so Tab
 * and Enter work), clicking anywhere on the row does the same, and the
 * selected row is marked (aria-current plus a visible style). Selecting a
 * row selects that node/relationship exactly as a click on the graph
 * would, so the details panel - Expand, View supporting events, Edit, ...
 * - follows. This is also the keyboard route to relationships, which
 * can't be reached on the canvas itself.
 */
function DataTable({ rows, columns, selectedId, onSelect, kind }) {
  if (rows.length === 0) {
    return <p style={{ fontSize: 12, color: '#6b7378' }}>None currently visible.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="graphlens-data-table graphlens-data-table-selectable">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = row.id === selectedId;
            const name = kind === 'node' ? (row.label || row.id) : (row.relationshipLabel || row.id);
            return (
              <tr
                key={row.id}
                className={isSelected ? 'graphlens-row-selected' : undefined}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(row.id)}
              >
                {columns.map((c, i) => (
                  <td key={c} style={{ whiteSpace: 'nowrap' }}>
                    {i === 0 ? (
                      <button
                        type="button"
                        className="graphlens-row-select"
                        aria-label={`Select ${kind === 'node' ? 'node' : 'relationship'} ${name}`}
                        onClick={(event) => { event.stopPropagation(); onSelect(row.id); }}
                      >
                        {String(row[c] ?? '')}
                      </button>
                    ) : String(row[c] ?? '')}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

DataTable.propTypes = {
  rows: PropTypes.array.isRequired,
  columns: PropTypes.array.isRequired,
  selectedId: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  kind: PropTypes.oneOf(['node', 'edge']).isRequired,
};

DataTable.defaultProps = { selectedId: null };

/**
 * A plain-table alternative to the canvas, over the identical node/edge
 * data the diagram renders - the same `renderable.nodes`/`renderable.edges`
 * (already passed through every active filter), so the two views never
 * disagree about what is currently "in" the graph. Selecting a row selects
 * that element (1.25.0); expanding, pinning etc. are then done from the
 * details panel, as for a canvas selection.
 */
export default function GraphTableView({ nodes, edges, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge }) {
  return (
    <div className="graphlens-canvas-table">
      <h3 style={{ marginTop: 0 }}>Nodes ({nodes.length})</h3>
      <DataTable rows={nodes} columns={NODE_COLUMNS} selectedId={selectedNodeId} onSelect={onSelectNode} kind="node" />
      <h3>Relationships ({edges.length})</h3>
      <DataTable rows={edges} columns={EDGE_COLUMNS} selectedId={selectedEdgeId} onSelect={onSelectEdge} kind="edge" />
    </div>
  );
}

GraphTableView.propTypes = {
  nodes: PropTypes.array.isRequired,
  edges: PropTypes.array.isRequired,
  selectedNodeId: PropTypes.string,
  selectedEdgeId: PropTypes.string,
  onSelectNode: PropTypes.func,
  onSelectEdge: PropTypes.func,
};

GraphTableView.defaultProps = {
  selectedNodeId: null,
  selectedEdgeId: null,
  onSelectNode: () => {},
  onSelectEdge: () => {},
};
