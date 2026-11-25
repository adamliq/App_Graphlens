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
 * Relationship data source (index vs. lookup): every template below that
 * reads observed relationships takes a `source` argument -
 * `{ type: 'index', index }` or `{ type: 'lookup', lookupName }` - built
 * from Configuration page settings (configService.js) by the caller.
 * This replaced a static `graphlens_relationship_index` macro
 * (`index=graphlens_relationships`, hardcoded in default/macros.conf) that
 * the Configuration page's own "Relationship index" field never actually
 * fed into - changing that setting silently did nothing, because nothing
 * read it back into the macro. See CHANGELOG.md.
 */
import {
  clampInteger, isValidId, GraphLensValidationError,
  safeIndexNameOrFallback, safeLookupNameOrFallback,
} from '../utilities/splSafety';

const DEFAULT_INDEX = 'graphlens_relationships';
const DEFAULT_LOOKUP = 'graphlens_relationships_lookup';

// edge_id is optional (DATA_MODEL.md, DATA_INGESTION.md) - documented as
// derived deterministically from source_id/target_id/relationship_type
// when missing. That derivation did not actually exist anywhere in this
// module until now: confirmed against a live instance (both index and
// lookup mode) that an edge with no edge_id field is silently dropped by
// every `stats ... by edge_id ...` below, the same class of bug
// previously fixed for evidence_reference (see the fillnull comment a few
// lines down and CHANGELOG.md) - `stats ... by` over a field entirely
// ABSENT from an event/row returns zero rows for it, not rows grouped
// under an empty value. This line must run before `graphlens_edge_fields`
// (which only projects fields, never derives one) and before any `stats
// ... by edge_id`. "_" is the separator because it is already part of
// utilities/splSafety.js's ID_PATTERN, so the derived value is itself
// always a valid identifier (an edge_id can end up re-validated by
// requireValidId, e.g. in buildEdgeDetailsSpl).
const DERIVE_EDGE_ID_LINE = '| eval edge_id=if(isnull(edge_id) OR edge_id="", source_id."_".relationship_type."_".target_id, edge_id)';

function requireValidId(id, field) {
  if (!isValidId(id)) {
    throw new GraphLensValidationError(`Invalid identifier for ${field}.`, field);
  }
  return id;
}

/**
 * Builds the one or two SPL lines that generate the observed-relationship
 * result set, before any filtering/aggregation. Index mode is a single
 * `search index="..."` line (optionally with inline filter args, since a
 * plain `search` command accepts trailing filter terms on the same line).
 * Lookup mode is `| inputlookup <name>` followed by a separate
 * `| search <filter args>` line when filtering is needed - `inputlookup`
 * does not accept the same inline trailing-filter-argument syntax a
 * generating `search` command does, so filtering is always a distinct
 * pipe stage in lookup mode.
 */
function buildRelationshipSourceLines(source, filterArgs) {
  const type = source && source.type === 'lookup' ? 'lookup' : 'index';
  if (type === 'lookup') {
    const lookupName = safeLookupNameOrFallback(source && source.lookupName, DEFAULT_LOOKUP);
    const lines = [`| inputlookup ${lookupName}`];
    if (filterArgs) lines.push(`| search ${filterArgs}`);
    return lines;
  }
  const indexName = safeIndexNameOrFallback(source && source.index, DEFAULT_INDEX);
  return [filterArgs ? `search index="${indexName}" ${filterArgs}` : `search index="${indexName}"`];
}

/** Entity search box: locate candidate nodes matching a validated/escaped search term. */
export function buildInitialEntitySearchSpl(splSafeTerm, resultLimit, source) {
  const limit = clampInteger(resultLimit, { min: 1, max: 100, fallback: 20 });
  return [
    ...buildRelationshipSourceLines(source),
    '| eval node_id=source_id, node_type=source_type, node_label=source_label',
    `| append [ ${buildRelationshipSourceLines(source).join(' ')} | eval node_id=target_id, node_type=target_type, node_label=target_label ]`,
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
export function buildExpandNodeSpl(nodeId, expansionLimit, source) {
  requireValidId(nodeId, 'node_id');
  const limit = clampInteger(expansionLimit, { min: 1, max: 5000, fallback: 100 });
  return [
    ...buildRelationshipSourceLines(source, `(source_id="${nodeId}" OR target_id="${nodeId}")`),
    `| where match("${nodeId}", \`graphlens_id_pattern\`)`,
    DERIVE_EDGE_ID_LINE,
    '| `graphlens_edge_fields`',
    // evidence_reference is optional (DATA_MODEL.md) - a data source that
    // never sets it (e.g. the RBAC model collector) leaves it not merely
    // empty but entirely ABSENT from these indexed events, because
    // INDEXED_EXTRACTIONS=csv never creates a field for an empty CSV
    // cell. `stats ... by` over a field that is absent from every
    // matching event returns zero rows, not rows grouped under an empty
    // value - confirmed against a live instance, this silently broke
    // every expand of an evidence-less node before this fillnull was
    // added. See CHANGELOG.md.
    '| fillnull value="" evidence_reference',
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label source_index source_sourcetype evidence_reference',
    '| sort 0 - risk_score - event_count',
    `| head ${limit}`,
  ].join('\n');
}

/** Aggregated node properties, merged with curated KV Store metadata. Not currently wired to any UI action (see KNOWN_LIMITATIONS.md); kept available for a future "refresh details" feature. */
export function buildNodeDetailsSpl(nodeId, source) {
  requireValidId(nodeId, 'node_id');
  return [
    ...buildRelationshipSourceLines(source, `(source_id="${nodeId}" OR target_id="${nodeId}")`),
    `| where match("${nodeId}", \`graphlens_id_pattern\`)`,
    `| eval node_id=if(source_id="${nodeId}", source_id, target_id), node_type=if(source_id="${nodeId}", source_type, target_type), node_label=if(source_id="${nodeId}", source_label, target_label)`,
    DERIVE_EDGE_ID_LINE,
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score dc(edge_id) as relationship_count values(source_index) as source_indexes values(source_sourcetype) as source_sourcetypes by node_id node_type node_label',
    '| lookup graphlens_nodes node_id OUTPUT description as curated_description node_group as curated_node_group metadata as curated_metadata',
    '| head 1',
  ].join('\n');
}

/** Aggregated edge properties. */
export function buildEdgeDetailsSpl(edgeId, source) {
  requireValidId(edgeId, 'edge_id');
  return [
    // Filtering on edge_id happens via `| search` *after* deriving it, not
    // as a generating-stage filter arg like the other templates use - a
    // derived edge_id (see DERIVE_EDGE_ID_LINE above) does not exist as a
    // field yet at the generating stage, so filtering there would always
    // find zero rows for any edge whose edge_id was derived rather than
    // stored.
    ...buildRelationshipSourceLines(source),
    DERIVE_EDGE_ID_LINE,
    `| search edge_id="${edgeId}"`,
    `| where match("${edgeId}", \`graphlens_id_pattern\`)`,
    '| `graphlens_edge_fields`',
    // See the matching comment in buildExpandNodeSpl above - evidence_reference
    // can be entirely absent (not just empty) from indexed events, which
    // makes `stats ... by` over it return zero rows unless fillnull'd first.
    '| fillnull value="" evidence_reference',
    '| stats sum(event_count) as event_count min(first_seen) as first_seen max(last_seen) as last_seen max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label source_index source_sourcetype evidence_reference',
    '| head 1',
  ].join('\n');
}

/**
 * Bounded supporting-event retrieval. `tokens` is the already-validated
 * output of evidenceQueryBuilder.js (safe_evidence_index,
 * safe_evidence_sourcetype, safe_evidence_key_field,
 * safe_evidence_key_value - the last already quoted and escaped).
 *
 * Always reads from an index (evidence/supporting events are, by
 * definition, raw events - they are never the lookup-sourced relationship
 * summary data itself), so this one does not take a `source` argument.
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

/**
 * Demo data (Configuration page "Load demo data"). All three have zero
 * dynamic tokens except the lookup-mode target name, which - like
 * `relationship_lookup` elsewhere in this module - is an
 * administrator-configured setting, not end-user input, and is still
 * validated via safeLookupNameOrFallback per this module's defence-in-depth
 * convention. These mirror the two-line SPL INSTALL.md already told
 * administrators to paste in by hand; demoDataService.js just dispatches
 * the identical commands instead of requiring that manual step.
 */
export function buildSeedNodeTypesSpl() {
  return '| inputlookup graphlens_sample_node_types | outputlookup graphlens_node_types';
}

export function buildSeedRelationshipTypesSpl() {
  return '| inputlookup graphlens_sample_relationship_types | outputlookup graphlens_relationship_types';
}

/** Demo data, lookup mode only: replaces the configured relationship lookup's entire contents with the bundled sample data - the same destructive-by-design behaviour `| outputlookup` always has (see CONFIGURATION.md). */
export function buildSeedRelationshipsLookupSpl(lookupName) {
  const safeLookupName = safeLookupNameOrFallback(lookupName, DEFAULT_LOOKUP);
  return `| inputlookup graphlens_sample_relationships | outputlookup ${safeLookupName}`;
}

// Sourcetype used only for demo data re-ingested in index mode - deliberately
// distinct from `graphlens:relationship` (default/props.conf sets that one's
// KV_MODE=none, since it relies on index-time INDEXED_EXTRACTIONS=csv
// instead, which only applies to events arriving through a real file/monitor
// input - confirmed against a live instance that `| collect`'s own output
// events never pass through that index-time extraction, so none of the
// fields would become searchable under `graphlens:relationship` itself).
// This sourcetype instead relies on Splunk's ordinary default KV_MODE=auto,
// which does correctly extract `collect`'s own key="value" output format -
// also confirmed live. The live search templates above never filter by
// sourcetype (only by index), so this is transparently found alongside
// everything else once loaded.
export const DEMO_RELATIONSHIP_SOURCETYPE = 'graphlens:relationship:demo';

/**
 * Demo data, index mode only: re-ingests the bundled sample relationships as
 * real events in the configured index via `| collect` (not `| outputlookup`
 * - there is no lookup involved here). `source_index`/`source_sourcetype`
 * are overwritten to match where this actually lands (rather than the
 * sample data's literal default), so `buildEvidenceSpl` - which always reads
 * an edge's own source_index/source_sourcetype fields - resolves correctly
 * even when the configured index differs from the default.
 */
export function buildSeedRelationshipsIndexSpl(indexName) {
  const safeIndex = safeIndexNameOrFallback(indexName, DEFAULT_INDEX);
  return [
    '| inputlookup graphlens_sample_relationships',
    `| eval source_index="${safeIndex}", source_sourcetype="${DEMO_RELATIONSHIP_SOURCETYPE}"`,
    `| collect index=${safeIndex} sourcetype=${DEMO_RELATIONSHIP_SOURCETYPE} testmode=false`,
    '| stats count',
  ].join('\n');
}

/** Optional bounded expansion of a collapsed cluster/group node. `clusterField` must be one of a small allowlisted set of field names (never raw user input). */
export function buildClusterExpandSpl(clusterField, splSafeClusterValue, limit, source) {
  const boundedLimit = clampInteger(limit, { min: 1, max: 1000, fallback: 100 });
  return [
    ...buildRelationshipSourceLines(source, `${clusterField}="${splSafeClusterValue}"`),
    DERIVE_EDGE_ID_LINE,
    '| `graphlens_edge_fields`',
    '| stats sum(event_count) as event_count max(risk_score) as risk_score by edge_id source_id source_type source_label target_id target_type target_label relationship_type relationship_label',
    '| sort 0 - risk_score - event_count',
    `| head ${boundedLimit}`,
  ].join('\n');
}
