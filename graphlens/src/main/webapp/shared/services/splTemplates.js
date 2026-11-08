/**
 * Builds the complete, final SPL strings GraphLens dispatches as ad-hoc
 * searches (POST to services/search/jobs).
 *
 * This replaces an earlier design that named a saved search
 * (default/savedsearches.conf) and tried to substitute `$token$`
 * placeholders in its SPL via `args.<token>` on the `/dispatch` REST call.
 * That does not work: confirmed against a live Splunk Enterprise 10.6.1.1
 * instance, `args.<token>` values are accepted by the dispatch endpoint
 * but are never substituted into the saved search's own `search` text -
 * the job that actually runs still contains the literal, unresolved
 * `$token$` string, which fails immediately (e.g. `| head $safe_limit$`
 * errors with "The argument must be a positive number or a boolean
 * expression."). See DEVELOPMENT.md and CHANGELOG.md for the full story.
 *
 * The replacement keeps every safety property the original design had:
 * every value spliced into these templates has already been validated
 * and/or escaped by utilities/splSafety.js (identifiers via
 * assertValidId/isValidId, free text via sanitizeSearchTerm, limits via
 * clampInteger returning a plain number) before it ever reaches this
 * module - nothing here accepts raw, unvalidated user input. The SPL
 * *shape* of each query is fixed and reviewable here, the same as it was
 * in savedsearches.conf; only the substitution mechanism changed.
 *
 * Macro invocations (`` `graphlens_relationship_index` ``, etc.) still
 * expand normally - macro expansion happens during SPL parsing and does
 * not depend on how the search was dispatched.
 */
import { clampInteger, isValidId, GraphLensValidationError } from '../utilities/splSafety';

function requireValidId(id, field) {
  if (!isValidId(id)) {
    throw new GraphLensValidationError(`Invalid identifier for ${field}.`, field);
  }
  return id;
}

/** Entity search box: locate candidate nodes matching a validated/escaped search term. */
export function buildInitialEntitySearchSpl(splSafeTerm, resultLimit) {
  const limit = clampInteger(resultLimit, { min: 1, max: 100, fallback: 20 });
  return [
    'search `graphlens_relationship_index`',
    '| eval node_id=source_id, node_type=source_type, node_label=source_label',
    '| append [ search `graphlens_relationship_index` | eval node_id=target_id, node_type=target_type, node_label=target_label ]',
    // Substring match on both node_id and node_label (not just a node_id
    // *prefix* match): node_id is namespaced ("user:jsmith"), so a user
    // searching for just the value portion ("jsmith") would otherwise
    // never match - confirmed missing against a live Splunk instance
    // loaded with the bundled sample data before this was widened.
    `| search (node_id="*${splSafeTerm}*" OR node_label="*${splSafeTerm}*")`,
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score by node_id node_type node_label source_index source_sourcetype',
    '| sort 0 - risk_score - event_count',
    `| head ${limit}`,
  ].join('\n');
}

/** One-hop expansion of a single validated node identifier. */
export function buildExpandNodeSpl(nodeId, expansionLimit) {
  requireValidId(nodeId, 'node_id');
  const limit = clampInteger(expansionLimit, { min: 1, max: 5000, fallback: 100 });
  return [
    `search \`graphlens_relationship_index\` (source_id="${nodeId}" OR target_id="${nodeId}")`,
    `| where match("${nodeId}", \`graphlens_id_pattern\`)`,
    '| `graphlens_edge_fields`',
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label source_index source_sourcetype evidence_reference',
    '| sort 0 - risk_score - event_count',
    `| head ${limit}`,
  ].join('\n');
}

/** Aggregated node properties, merged with curated KV Store metadata. Not currently wired to any UI action (see KNOWN_LIMITATIONS.md); kept available for a future "refresh details" feature. */
export function buildNodeDetailsSpl(nodeId) {
  requireValidId(nodeId, 'node_id');
  return [
    `search \`graphlens_relationship_index\` (source_id="${nodeId}" OR target_id="${nodeId}")`,
    `| where match("${nodeId}", \`graphlens_id_pattern\`)`,
    `| eval node_id=if(source_id="${nodeId}", source_id, target_id), node_type=if(source_id="${nodeId}", source_type, target_type), node_label=if(source_id="${nodeId}", source_label, target_label)`,
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score dc(edge_id) as relationship_count values(source_index) as source_indexes values(source_sourcetype) as source_sourcetypes by node_id node_type node_label',
    '| lookup graphlens_nodes node_id OUTPUT description as curated_description node_group as curated_node_group metadata as curated_metadata',
    '| head 1',
  ].join('\n');
}

/** Aggregated edge properties. */
export function buildEdgeDetailsSpl(edgeId) {
  requireValidId(edgeId, 'edge_id');
  return [
    `search \`graphlens_relationship_index\` edge_id="${edgeId}"`,
    `| where match("${edgeId}", \`graphlens_id_pattern\`)`,
    '| `graphlens_edge_fields`',
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label source_index source_sourcetype evidence_reference',
    '| head 1',
  ].join('\n');
}

/**
 * Bounded supporting-event retrieval. `tokens` is the already-validated
 * output of evidenceQueryBuilder.js (safe_evidence_index,
 * safe_evidence_sourcetype, safe_evidence_key_field,
 * safe_evidence_key_value - the last already quoted and escaped).
 */
export function buildEvidenceSpl(tokens, limit) {
  const boundedLimit = clampInteger(limit, { min: 1, max: 1000, fallback: 100 });
  return [
    `search index=${tokens.safe_evidence_index} sourcetype=${tokens.safe_evidence_sourcetype} ${tokens.safe_evidence_key_field}=${tokens.safe_evidence_key_value}`,
    `| head ${boundedLimit}`,
    '| sort - _time',
  ].join('\n');
}

/** Aggregate counts for the graph-limit banner and health reporting. No dynamic tokens - still dispatched as the named `graphlens_graph_statistics` saved search. */

/** Optional bounded expansion of a collapsed cluster/group node. `clusterField` must be one of a small allowlisted set of field names (never raw user input). */
export function buildClusterExpandSpl(clusterField, splSafeClusterValue, limit) {
  const boundedLimit = clampInteger(limit, { min: 1, max: 1000, fallback: 100 });
  return [
    `search \`graphlens_relationship_index\` ${clusterField}="${splSafeClusterValue}"`,
    '| `graphlens_edge_fields`',
    '| stats sum(event_count) as event_count max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label',
    '| sort 0 - risk_score - event_count',
    `| head ${boundedLimit}`,
  ].join('\n');
}
