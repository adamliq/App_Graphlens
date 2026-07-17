/**
 * Reads the current user's effective Splunk capabilities so the UI can
 * hide/disable controls the user's role does not grant (a convenience,
 * not the authority - every underlying write is still gated by Splunk's
 * own role-based access control on the REST endpoint itself; see
 * authorize.conf and SECURITY.md).
 */
import { splunkFetch } from '../utilities/restClient';

let cachedCapabilities;

export async function getCurrentUserCapabilities({ fetchImpl, forceRefresh = false } = {}) {
  if (cachedCapabilities && !forceRefresh) {
    return cachedCapabilities;
  }
  try {
    const response = await splunkFetch('/services/authentication/current-context?output_mode=json', { method: 'GET' }, { fetchImpl });
    const body = await response.json();
    const entry = body.entry && body.entry[0];
    const capabilities = (entry && entry.content && entry.content.capabilities) || [];
    cachedCapabilities = capabilities;
    return capabilities;
  } catch (err) {
    cachedCapabilities = [];
    return [];
  }
}

export async function hasCapability(capability, options) {
  const capabilities = await getCurrentUserCapabilities(options);
  return capabilities.includes(capability) || capabilities.includes('admin_all_objects');
}

export const CAPABILITIES = Object.freeze({
  RUN_SEARCH: 'graphlens_run_search',
  VIEW_EVIDENCE: 'graphlens_view_evidence',
  EXPORT_GRAPH: 'graphlens_export_graph',
  CREATE_ANNOTATION: 'graphlens_create_annotation',
  MANAGE_SHARED_ANNOTATION: 'graphlens_manage_shared_annotation',
  SAVE_VIEW: 'graphlens_save_view',
  MANAGE_SHARED_VIEW: 'graphlens_manage_shared_view',
  MANAGE_CONFIG: 'graphlens_manage_config',
  MANAGE_COLLECTIONS: 'graphlens_manage_collections',
  VIEW_HEALTH: 'graphlens_view_health',
});
