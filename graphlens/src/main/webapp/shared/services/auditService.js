/**
 * Writes a lightweight, best-effort audit trail entry to the
 * graphlens_audit_log KV Store collection for every tracked user action
 * (section 27 of the design brief). Never stores credentials, tokens or
 * raw event content - only identifiers, the action name and an outcome.
 * A failure to write an audit record never blocks the user-facing action
 * it describes; it is logged to the console and swallowed.
 */
import { insertRecord } from './kvStoreService';
import { getCurrentUsername } from '../utilities/restClient';
import { sanitizeForExportCell } from '../utilities/splSafety';

export const AUDIT_ACTIONS = Object.freeze({
  SEARCH: 'search',
  EXPAND_NODE: 'expand_node',
  COLLAPSE_NODE: 'collapse_node',
  VIEW_EVIDENCE: 'view_evidence',
  EXPORT_GRAPH: 'export_graph',
  CREATE_ANNOTATION: 'create_annotation',
  DELETE_ANNOTATION: 'delete_annotation',
  SAVE_VIEW: 'save_view',
  DELETE_VIEW: 'delete_view',
  CONFIG_CHANGE: 'config_change',
  GRAPH_LIMIT_REACHED: 'graph_limit_reached',
  CLIENT_ERROR: 'client_error',
});

function randomEventId() {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `evt:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * @param {string} action - one of AUDIT_ACTIONS
 * @param {Object} [details]
 * @param {'success'|'failure'|'denied'} [details.outcome]
 * @param {string} [details.nodeId]
 * @param {string} [details.edgeId]
 * @param {string} [details.detail] - short, non-sensitive free text
 */
export async function recordAuditEvent(action, details = {}) {
  const record = {
    event_id: randomEventId(),
    action,
    actor: getCurrentUsername(),
    node_id: details.nodeId || '',
    edge_id: details.edgeId || '',
    outcome: details.outcome || 'success',
    detail: sanitizeForExportCell(details.detail || '', { maxLength: 500 }),
    created_time: Date.now() / 1000,
  };
  try {
    await insertRecord('graphlens_audit_log', record);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('GraphLens: failed to write audit log entry', err && err.code);
  }
}
