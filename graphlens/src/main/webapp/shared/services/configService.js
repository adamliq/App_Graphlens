/**
 * Reads (and, for administrators, writes) GraphLens's administrator
 * configuration, backed by graphlens_settings.conf via Splunk's standard
 * configs/conf-* REST endpoint - not a custom REST handler, so no Python
 * backend code is required.
 *
 * Write access to arbitrary custom .conf files through this generic
 * endpoint is gated by Splunk's built-in admin_all_objects capability by
 * default. The Configuration page additionally hides/disables its Save
 * controls unless the current user holds the graphlens_manage_config
 * capability, but that is a UI convenience, not the authoritative
 * boundary - see SECURITY.md for how to layer a restmap.conf capability
 * mapping if finer-grained delegation than admin_all_objects is required,
 * and verify the exact syntax against the Splunk version in use.
 */
import { splunkFetch } from '../utilities/restClient';
import { clampInteger } from '../utilities/splSafety';

const CONF_NAME = 'graphlens_settings';

function coerceBool(value, fallback) {
  if (value === '1' || value === 'true' || value === true) return true;
  if (value === '0' || value === 'false' || value === false) return false;
  return fallback;
}

function coerceList(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

const DEFAULTS = Object.freeze({
  maxVisibleNodes: 1000,
  maxVisibleEdges: 2500,
  maxExpansionNeighbours: 100,
  maxExpansionDepth: 3,
  maxPathDepth: 5,
  maxSearchResultRows: 500,
  searchDispatchMaxTimeSeconds: 30,
  relationshipIndex: 'graphlens_relationships',
  evidenceDefaultIndex: '*',
  defaultEarliest: '-24h',
  defaultLatest: 'now',
  enableExport: true,
  enableAnnotations: true,
  enableSavedViews: true,
  enableClustering: true,
  enablePathFinder: true,
  allowedNodeTypes: [],
  allowedRelationshipTypes: [],
  allowedLayouts: ['cose', 'concentric', 'breadthfirst', 'circle', 'grid'],
  allowedExportFormats: ['json', 'csv', 'png'],
});

export async function getSettings({ fetchImpl } = {}) {
  try {
    const response = await splunkFetch(
      `/servicesNS/nobody/graphlens/configs/conf-${CONF_NAME}?output_mode=json&count=0`,
      { method: 'GET' },
      { fetchImpl },
    );
    const body = await response.json();
    const byStanza = {};
    (body.entry || []).forEach((entry) => {
      byStanza[entry.name] = entry.content;
    });
    const limits = byStanza.limits || {};
    const search = byStanza.search || {};
    const features = byStanza.features || {};
    const allowlist = byStanza.allowlist || {};

    return {
      maxVisibleNodes: clampInteger(limits.max_visible_nodes, { min: 1, max: 100000, fallback: DEFAULTS.maxVisibleNodes }),
      maxVisibleEdges: clampInteger(limits.max_visible_edges, { min: 1, max: 250000, fallback: DEFAULTS.maxVisibleEdges }),
      maxExpansionNeighbours: clampInteger(limits.max_expansion_neighbours, { min: 1, max: 5000, fallback: DEFAULTS.maxExpansionNeighbours }),
      maxExpansionDepth: clampInteger(limits.max_expansion_depth, { min: 1, max: 20, fallback: DEFAULTS.maxExpansionDepth }),
      maxPathDepth: clampInteger(limits.max_path_depth, { min: 1, max: 20, fallback: DEFAULTS.maxPathDepth }),
      maxSearchResultRows: clampInteger(limits.max_search_result_rows, { min: 1, max: 50000, fallback: DEFAULTS.maxSearchResultRows }),
      searchDispatchMaxTimeSeconds: clampInteger(limits.search_dispatch_max_time_seconds, { min: 1, max: 600, fallback: DEFAULTS.searchDispatchMaxTimeSeconds }),
      relationshipIndex: search.relationship_index || DEFAULTS.relationshipIndex,
      evidenceDefaultIndex: search.evidence_default_index || DEFAULTS.evidenceDefaultIndex,
      defaultEarliest: search.default_earliest || DEFAULTS.defaultEarliest,
      defaultLatest: search.default_latest || DEFAULTS.defaultLatest,
      enableExport: coerceBool(features.enable_export, DEFAULTS.enableExport),
      enableAnnotations: coerceBool(features.enable_annotations, DEFAULTS.enableAnnotations),
      enableSavedViews: coerceBool(features.enable_saved_views, DEFAULTS.enableSavedViews),
      enableClustering: coerceBool(features.enable_clustering, DEFAULTS.enableClustering),
      enablePathFinder: coerceBool(features.enable_path_finder, DEFAULTS.enablePathFinder),
      allowedNodeTypes: coerceList(allowlist.allowed_node_types),
      allowedRelationshipTypes: coerceList(allowlist.allowed_relationship_types),
      allowedLayouts: coerceList(allowlist.allowed_layouts).length ? coerceList(allowlist.allowed_layouts) : DEFAULTS.allowedLayouts,
      allowedExportFormats: coerceList(allowlist.allowed_export_formats).length ? coerceList(allowlist.allowed_export_formats) : DEFAULTS.allowedExportFormats,
    };
  } catch (err) {
    // Fail safe to conservative built-in defaults rather than surfacing a
    // hard error - the explorer should still be usable if settings
    // retrieval fails for any reason.
    return { ...DEFAULTS };
  }
}

/** Requires graphlens_manage_config (enforced by Splunk's admin_all_objects gate on the underlying endpoint - see module doc comment). */
export async function updateSettingsStanza(stanza, values, { fetchImpl } = {}) {
  const allowedStanzas = ['limits', 'search', 'features', 'allowlist'];
  if (!allowedStanzas.includes(stanza)) {
    throw new Error(`Unknown settings stanza: ${stanza}`);
  }
  const params = new URLSearchParams({ output_mode: 'json' });
  Object.entries(values).forEach(([key, value]) => params.set(key, String(value)));
  await splunkFetch(
    `/servicesNS/nobody/graphlens/configs/conf-${CONF_NAME}/${encodeURIComponent(stanza)}`,
    { method: 'POST', body: params },
    { fetchImpl },
  );
}
