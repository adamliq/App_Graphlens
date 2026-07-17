/**
 * @jest-environment jsdom
 */
import { dispatchSavedSearch, cancelJob } from '../../src/main/webapp/shared/services/searchService';

function jsonResponse(body, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

beforeEach(() => {
  window.$C = { MRSPARKLE_ROOT_PATH: '', LOCALE: 'en-US' };
  document.cookie = '';
});

test('dispatches, polls until DONE, and returns results', async () => {
  let statusCalls = 0;
  const fetchImpl = jest.fn((url) => {
    if (url.includes('/dispatch')) {
      return jsonResponse({ sid: 'sid123' });
    }
    if (url.includes('/results')) {
      return jsonResponse({ results: [{ a: '1' }], fields: [{ name: 'a' }] });
    }
    statusCalls += 1;
    const dispatchState = statusCalls < 2 ? 'RUNNING' : 'DONE';
    return jsonResponse({ entry: [{ content: { dispatchState, isFailed: false } }] });
  });

  const job = dispatchSavedSearch('graphlens_expand_node', { safe_node_id: 'user:jsmith' }, { fetchImpl, maxWaitMs: 5000 });
  const { rows, fieldOrder } = await job.waitForResults();
  expect(rows).toEqual([{ a: '1' }]);
  expect(fieldOrder).toEqual(['a']);
  expect(job.sid).toBe('sid123');
});

test('throws a normalised error when the search fails', async () => {
  const fetchImpl = jest.fn((url) => {
    if (url.includes('/dispatch')) return jsonResponse({ sid: 'sid123' });
    return jsonResponse({ entry: [{ content: { dispatchState: 'FAILED', isFailed: true, messages: [{ text: 'bad search' }] } }] });
  });
  const job = dispatchSavedSearch('graphlens_expand_node', {}, { fetchImpl, maxWaitMs: 5000 });
  await expect(job.waitForResults()).rejects.toThrow('bad search');
});

test('surfaces a forbidden error without leaking internal detail', async () => {
  const fetchImpl = jest.fn(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }));
  const job = dispatchSavedSearch('graphlens_expand_node', {}, { fetchImpl, maxWaitMs: 5000 });
  await expect(job.waitForResults()).rejects.toThrow('permission');
});

test('cancel() stops polling and calls the control endpoint', async () => {
  const calledUrls = [];
  const fetchImpl = jest.fn((url) => {
    calledUrls.push(url);
    if (url.includes('/dispatch')) return jsonResponse({ sid: 'sid123' });
    if (url.includes('/control')) return jsonResponse({});
    return jsonResponse({ entry: [{ content: { dispatchState: 'RUNNING', isFailed: false } }] });
  });
  const job = dispatchSavedSearch('graphlens_expand_node', {}, { fetchImpl, maxWaitMs: 5000 });
  await job.cancel();
  expect(calledUrls.some((u) => u.includes('/control'))).toBe(true);
});

test('cancelJob is a safe no-op when sid is falsy', async () => {
  await expect(cancelJob(undefined)).resolves.toBeUndefined();
});
