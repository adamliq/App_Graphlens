/**
 * Parses a previously-exported GraphLens JSON file back into the raw
 * node/edge "row" shape graphTransformer.transformRowsToGraph expects
 * (node_id/node_type/..., edge_id/source_id/...) - the exact counterpart
 * to exportService.js's exportGraphAsJson. Nothing from an imported file
 * is trusted any more than a Splunk search result would be: the rows
 * produced here still go through transformRowsToGraph's own
 * validation/escaping/dedup/limit logic before ever becoming graph state,
 * the same as every other node/edge admission path in the app.
 */
import { GraphLensValidationError } from '../utilities/splSafety';

/** Parses `jsonText` (the contents of a file picked via the Import button) into `{ nodeRows, edgeRows, metadata }`. Throws GraphLensValidationError if it is not valid JSON or lacks the expected `{ nodes: [...], edges: [...] }` shape. */
export function parseImportedGraphJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    throw new GraphLensValidationError('That file is not valid JSON.', 'import');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GraphLensValidationError('That file is not a GraphLens graph export.', 'import');
  }
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new GraphLensValidationError('That file is not a GraphLens graph export (expected "nodes" and "edges" arrays).', 'import');
  }

  const nodeRows = parsed.nodes
    .filter((n) => n && typeof n === 'object')
    .map((n) => ({
      node_id: n.id,
      node_type: n.type,
      node_label: n.label,
      node_group: n.group,
      risk_score: n.riskScore,
      event_count: n.eventCount,
      first_seen: n.firstSeen,
      last_seen: n.lastSeen,
      source_index: n.sourceIndex,
      source_sourcetype: n.sourceSourcetype,
    }));

  const edgeRows = parsed.edges
    .filter((e) => e && typeof e === 'object')
    .map((e) => ({
      edge_id: e.id,
      source_id: e.source,
      target_id: e.target,
      relationship_type: e.relationship,
      relationship_label: e.relationshipLabel,
      directed: e.directed,
      event_count: e.eventCount,
      risk_score: e.riskScore,
      first_seen: e.firstSeen,
      last_seen: e.lastSeen,
    }));

  return { nodeRows, edgeRows, metadata: (parsed.metadata && typeof parsed.metadata === 'object') ? parsed.metadata : null };
}
