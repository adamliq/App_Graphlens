/**
 * Classifies the raw result rows of an already-completed Splunk search job
 * ("Load from job" - RelationshipExplorer/App.jsx) into the same
 * node-row/edge-row shapes transformRowsToGraph already expects from every
 * other relationship source (DATA_MODEL.md; the Help page's schema
 * table). GraphLens cannot know in advance whether an arbitrary job's
 * results look like a one-hop expansion (edge rows: source_id, target_id,
 * relationship_type, ...) or a plain entity list (node rows: node_id,
 * node_type, node_label, ...), or a mix of both rows run together - so it
 * inspects each row's own fields rather than assuming one shape, the same
 * defensive stance importService.js already takes for a parsed JSON file.
 * A row matching neither shape is silently dropped (reported via the
 * returned counts), never passed through partially.
 */

function isEdgeRow(row) {
  return Boolean(row && row.source_id && row.target_id && row.relationship_type);
}

function isNodeRow(row) {
  return Boolean(row && row.node_id);
}

/**
 * @param {Array<Object>} rows - raw rows from searchService.js's waitForResults()
 * @returns {{nodeRows: Array<Object>, edgeRows: Array<Object>, droppedCount: number}}
 */
export function classifyJobResultRows(rows) {
  const nodeRows = [];
  const edgeRows = [];
  let droppedCount = 0;
  (rows || []).forEach((row) => {
    if (isEdgeRow(row)) {
      edgeRows.push(row);
    } else if (isNodeRow(row)) {
      nodeRows.push(row);
    } else {
      droppedCount += 1;
    }
  });
  return { nodeRows, edgeRows, droppedCount };
}
