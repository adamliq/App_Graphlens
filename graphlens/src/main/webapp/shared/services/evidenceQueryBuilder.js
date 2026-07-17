/**
 * Builds the validated token set for the graphlens_evidence_search saved
 * search from a selected node or edge. This is the only place that decides
 * which index/sourcetype/field/value combination to query for evidence,
 * so it is easy to audit that no free-form user input reaches this search
 * unescaped (section 15 - evidence must come from an approved template,
 * never raw user SPL).
 */
import {
  assertValidId,
  escapeSplStringLiteral,
  GraphLensValidationError,
  safeIndexNameOrFallback,
  safeSourcetypeOrFallback,
} from '../utilities/splSafety';

// Conservative default field-name heuristic per node type, used only when
// the node itself does not carry a more specific evidence key (edges
// always use their own evidence_reference field, which is exact).
// Administrators can extend this mapping through node type configuration
// metadata (graphlens_node_types.metadata.evidenceKeyField) without a code
// change; this is the built-in fallback.
const NODE_TYPE_KEY_FIELD = Object.freeze({
  user: 'src_user',
  host: 'dest_host',
  server: 'dest_host',
  ip: 'dest_ip',
  process: 'process',
  domain: 'dest_domain',
});

function labelToSearchValue(label) {
  const cleaned = String(label || '').replace(/[^A-Za-z0-9 ._:@-]/g, '').trim();
  if (!cleaned) {
    throw new GraphLensValidationError('Nothing safe to search for in that label.', 'label');
  }
  return escapeSplStringLiteral(cleaned);
}

export function buildEvidenceTokensForEdge(edge, { evidenceDefaultIndex = '*' } = {}) {
  if (!edge || !edge.evidenceReference) {
    return null;
  }
  assertValidId(edge.evidenceReference, 'evidence_reference');
  return {
    safe_evidence_index: safeIndexNameOrFallback(edge.sourceIndex, evidenceDefaultIndex),
    safe_evidence_sourcetype: safeSourcetypeOrFallback(edge.sourceSourcetype, '*'),
    safe_evidence_key_field: 'evidence_reference',
    safe_evidence_key_value: `"${escapeSplStringLiteral(edge.evidenceReference)}"`,
  };
}

export function buildEvidenceTokensForNode(node, { evidenceDefaultIndex = '*' } = {}) {
  if (!node) return null;
  const keyField = NODE_TYPE_KEY_FIELD[node.type] || 'value';
  const keyValue = labelToSearchValue(node.label);
  return {
    safe_evidence_index: safeIndexNameOrFallback(node.sourceIndex, evidenceDefaultIndex),
    safe_evidence_sourcetype: safeSourcetypeOrFallback(node.sourceSourcetype, '*'),
    safe_evidence_key_field: keyField,
    safe_evidence_key_value: `"${keyValue}"`,
  };
}
