/**
 * CRUD access to GraphLens KV Store collections (collections.conf) through
 * Splunk's documented storage/collections/data REST endpoint. Splunk
 * enforces the collection-level ACL (metadata/default.meta) and the
 * requesting user's session on every call - this module does not, and
 * cannot, bypass that.
 */
import { splunkFetch } from '../utilities/restClient';
import { assertValidId, GraphLensValidationError } from '../utilities/splSafety';

const COLLECTION_ALLOWLIST = Object.freeze([
  'graphlens_nodes',
  'graphlens_edges',
  'graphlens_node_types',
  'graphlens_relationship_types',
  'graphlens_saved_views',
  'graphlens_annotations',
  'graphlens_audit_log',
]);

function assertKnownCollection(collection) {
  if (!COLLECTION_ALLOWLIST.includes(collection)) {
    throw new GraphLensValidationError(`Unknown KV Store collection: ${collection}`, 'collection');
  }
}

function collectionPath(collection, app = 'graphlens') {
  return `/servicesNS/nobody/${encodeURIComponent(app)}/storage/collections/data/${encodeURIComponent(collection)}`;
}

export async function queryCollection(collection, { query, sort, limit = 200, skip = 0, fields, fetchImpl } = {}) {
  assertKnownCollection(collection);
  const params = new URLSearchParams({ output_mode: 'json', limit: String(Math.min(limit, 1000)), skip: String(skip) });
  if (query) params.set('query', JSON.stringify(query));
  if (sort) params.set('sort', sort);
  if (fields) params.set('fields', fields.join(','));
  const response = await splunkFetch(`${collectionPath(collection)}?${params.toString()}`, { method: 'GET' }, { fetchImpl });
  return response.json();
}

export async function getRecord(collection, key, { fetchImpl } = {}) {
  assertKnownCollection(collection);
  assertValidId(key, 'key');
  const response = await splunkFetch(
    `${collectionPath(collection)}/${encodeURIComponent(key)}?output_mode=json`,
    { method: 'GET' },
    { fetchImpl },
  );
  return response.json();
}

export async function insertRecord(collection, record, { fetchImpl } = {}) {
  assertKnownCollection(collection);
  const response = await splunkFetch(
    `${collectionPath(collection)}?output_mode=json`,
    { method: 'POST', body: JSON.stringify(record), headers: { 'Content-Type': 'application/json' } },
    { fetchImpl },
  );
  return response.json();
}

export async function updateRecord(collection, key, record, { fetchImpl } = {}) {
  assertKnownCollection(collection);
  assertValidId(key, 'key');
  const response = await splunkFetch(
    `${collectionPath(collection)}/${encodeURIComponent(key)}?output_mode=json`,
    { method: 'POST', body: JSON.stringify(record), headers: { 'Content-Type': 'application/json' } },
    { fetchImpl },
  );
  return response.json();
}

export async function deleteRecord(collection, key, { fetchImpl } = {}) {
  assertKnownCollection(collection);
  assertValidId(key, 'key');
  await splunkFetch(
    `${collectionPath(collection)}/${encodeURIComponent(key)}?output_mode=json`,
    { method: 'DELETE' },
    { fetchImpl },
  );
}
