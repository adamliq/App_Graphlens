/**
 * @jest-environment jsdom
 */
import { loadDemoData } from '../../src/main/webapp/shared/services/demoDataService';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

/** Builds a fetchImpl that resolves every dispatched search to DONE and tags each sid to the search string that started it, so /results can return the right rows for that search. */
function makeFetchImpl({ onDispatch } = {}) {
  const sidToSearch = {};
  let sidCounter = 0;
  return jest.fn((url, init = {}) => {
    if (url.includes('/services/search/jobs') && init.method === 'POST' && !url.includes('/control')) {
      sidCounter += 1;
      const sid = `sid${sidCounter}`;
      const search = init.body.get('search');
      sidToSearch[sid] = search;
      if (onDispatch) onDispatch(search);
      return jsonResponse({ sid });
    }
    const statusMatch = url.match(/\/services\/search\/jobs\/([^/?]+)\?output_mode/);
    if (statusMatch) {
      return jsonResponse({ entry: [{ content: { dispatchState: 'DONE', isFailed: false } }] });
    }
    const resultsMatch = url.match(/\/services\/search\/jobs\/([^/?]+)\/results/);
    if (resultsMatch) {
      const sid = decodeURIComponent(resultsMatch[1]);
      const search = sidToSearch[sid];
      if (search.includes('| collect')) {
        return jsonResponse({ results: [{ count: '39' }], fields: [{ name: 'count' }] });
      }
      if (search.includes('outputlookup') && search.includes('graphlens_sample_relationships')) {
        const rows = Array.from({ length: 39 }, (_, i) => ({ edge_id: `edge:${i}` }));
        return jsonResponse({ results: rows, fields: [{ name: 'edge_id' }] });
      }
      return jsonResponse({ results: [], fields: [] });
    }
    return jsonResponse({});
  });
}

beforeEach(() => {
  window.$C = { MRSPARKLE_ROOT_PATH: '', LOCALE: 'en-US' };
  document.cookie = '';
});

describe('loadDemoData - index mode', () => {
  test('seeds type lookups and collects sample relationships into the configured index', async () => {
    const dispatchedSearches = [];
    const fetchImpl = makeFetchImpl({ onDispatch: (search) => dispatchedSearches.push(search) });

    const result = await loadDemoData({ source: { type: 'index', index: 'my_custom_index' }, fetchImpl });

    expect(result).toEqual({ mode: 'index', relationshipCount: 39 });
    expect(dispatchedSearches.some((s) => s.includes('collect index=my_custom_index sourcetype=graphlens:relationship:demo'))).toBe(true);
    expect(dispatchedSearches.some((s) => s.includes('| outputlookup graphlens_node_types'))).toBe(true);
    expect(dispatchedSearches.some((s) => s.includes('| outputlookup graphlens_relationship_types'))).toBe(true);
  });

  test('falls back to the default index for an invalid configured index name', async () => {
    const dispatchedSearches = [];
    const fetchImpl = makeFetchImpl({ onDispatch: (search) => dispatchedSearches.push(search) });
    await loadDemoData({ source: { type: 'index', index: '../etc/passwd' }, fetchImpl });
    expect(dispatchedSearches.some((s) => s.includes('collect index=graphlens_relationships sourcetype=graphlens:relationship:demo'))).toBe(true);
  });
});

describe('loadDemoData - lookup mode', () => {
  test('seeds type lookups and replaces the configured relationship lookup', async () => {
    const dispatchedSearches = [];
    const fetchImpl = makeFetchImpl({ onDispatch: (search) => dispatchedSearches.push(search) });

    const result = await loadDemoData({ source: { type: 'lookup', lookupName: 'my_custom_lookup' }, fetchImpl });

    expect(result).toEqual({ mode: 'lookup', relationshipCount: 39 });
    expect(dispatchedSearches.some((s) => s.includes('| outputlookup my_custom_lookup'))).toBe(true);
    expect(dispatchedSearches.some((s) => s.includes('| outputlookup graphlens_node_types'))).toBe(true);
    expect(dispatchedSearches.some((s) => s.includes('| outputlookup graphlens_relationship_types'))).toBe(true);
  });
});

test('propagates a search failure instead of silently reporting success', async () => {
  const fetchImpl = jest.fn((url, init = {}) => {
    if (url.includes('/services/search/jobs') && init.method === 'POST' && !url.includes('/control')) {
      return jsonResponse({ sid: 'sidfail' });
    }
    if (url.match(/\/services\/search\/jobs\/sidfail\?output_mode/)) {
      return jsonResponse({ entry: [{ content: { dispatchState: 'FAILED', isFailed: true, messages: [{ text: 'bad collect' }] } }] });
    }
    return jsonResponse({});
  });
  await expect(loadDemoData({ source: { type: 'index', index: 'graphlens_relationships' }, fetchImpl }))
    .rejects.toThrow('bad collect');
});
