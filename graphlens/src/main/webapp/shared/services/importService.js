/**
 * Parses a file picked via the toolbar Import button into the raw
 * node/edge "row" shape graphTransformer.transformRowsToGraph expects
 * (node_id/node_type/..., edge_id/source_id/...). Two independent input
 * shapes are supported:
 *
 * - A previously-exported GraphLens JSON file (parseImportedGraphJson) -
 *   the exact counterpart to exportService.js's exportGraphAsJson.
 * - A CSV file already shaped to the relationship schema documented on
 *   the Help page (parseImportedGraphCsv) - the same schema an index,
 *   lookup, saved search, dataset or "Load from job" already produces,
 *   and the one the bundled sample data ships as (lookups/
 *   graphlens_sample_relationships.csv). This is deliberately NOT the
 *   schema exportNodesAsCsv/exportEdgesAsCsv write (different column
 *   names, two separate files for one graph) - that export pair is not
 *   re-importable; see KNOWN_LIMITATIONS.md.
 *
 * Nothing from an imported file is trusted any more than a Splunk search
 * result would be: the rows produced here still go through
 * transformRowsToGraph's own validation/escaping/dedup/limit logic
 * before ever becoming graph state, the same as every other node/edge
 * admission path in the app.
 */
import { GraphLensValidationError } from '../utilities/splSafety';
import { classifyJobResultRows } from './jobResultsService';

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

/**
 * RFC4180-ish CSV tokenizer: splits `text` into rows of raw field
 * strings, honouring double-quoted fields (embedded commas, newlines,
 * and "" as an escaped quote - exactly what the bundled sample data
 * (lookups/graphlens_sample_relationships.csv) already relies on for
 * its quoted ldap_group distinguished names). No external dependency;
 * this is deliberately small and hand-rolled, mirroring
 * exportService.js's own hand-rolled `toCsv` on the way out.
 */
function tokenizeCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // swallow; a following \n (if any) ends the row below
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses `csvText` (the contents of a CSV file picked via the Import
 * button) into `{ nodeRows, edgeRows }`. The CSV must have a header row
 * naming relationship-schema columns (source_id/target_id/
 * relationship_type/... for an edge row, node_id/node_type/... for a
 * node row, or a mix of both across rows - see the Help page) - the
 * same schema every other relationship source already produces.
 * Classification reuses jobResultsService.js's classifyJobResultRows so
 * a CSV import and a "Load from job" import behave identically once
 * rows exist as plain objects. Throws GraphLensValidationError if the
 * file is empty, has no header row, or no row matches either shape.
 */
export function parseImportedGraphCsv(csvText) {
  if (typeof csvText !== 'string' || csvText.trim().length === 0) {
    throw new GraphLensValidationError('That file is empty.', 'import');
  }

  const rawRows = tokenizeCsv(csvText).filter((r) => !(r.length === 1 && r[0].trim() === ''));
  if (rawRows.length === 0) {
    throw new GraphLensValidationError('That file is empty.', 'import');
  }

  const header = rawRows[0].map((h) => h.trim());
  if (header.every((h) => h === '')) {
    throw new GraphLensValidationError('That CSV has no header row.', 'import');
  }

  const objects = rawRows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      if (h) obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });

  const { nodeRows, edgeRows } = classifyJobResultRows(objects);
  if (nodeRows.length === 0 && edgeRows.length === 0) {
    throw new GraphLensValidationError("That CSV doesn't match the relationship schema - see the Help page.", 'import');
  }
  return { nodeRows, edgeRows };
}
