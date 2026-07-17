/**
 * Dispatches GraphLens's controlled saved searches (default/savedsearches.conf)
 * through Splunk's supported REST search API and normalises polling,
 * cancellation, timeouts and errors. Every call site passes a saved search
 * *name* plus an object of already-validated/escaped token values - never
 * a raw SPL string. See utilities/splSafety.js and ARCHITECTURE.md.
 */
import { splunkFetch, GraphLensApiError, toUserFacingError } from '../utilities/restClient';

export { toUserFacingError };
export const GraphLensSearchError = GraphLensApiError;

const DEFAULT_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 4000;

function buildDispatchArgs(tokens, { earliest, latest, maxResultRows }) {
  const params = new URLSearchParams();
  params.set('output_mode', 'json');
  params.set('dispatch.earliest_time', earliest || '-24h');
  params.set('dispatch.latest_time', latest || 'now');
  if (maxResultRows) {
    params.set('max_count', String(maxResultRows));
  }
  Object.entries(tokens || {}).forEach(([key, value]) => {
    params.set(`args.${key}`, String(value));
  });
  return params;
}

/**
 * Dispatch a saved search by name with validated token substitutions.
 * Returns a handle exposing `sid`, `waitForResults()` and `cancel()`.
 */
export function dispatchSavedSearch(savedSearchName, tokens = {}, options = {}) {
  const { earliest, latest, maxResultRows, maxWaitMs = 30000, fetchImpl } = options;
  let cancelled = false;
  let sid;

  const dispatchPromise = (async () => {
    const params = buildDispatchArgs(tokens, { earliest, latest, maxResultRows });
    const response = await splunkFetch(
      `/services/saved/searches/${encodeURIComponent(savedSearchName)}/dispatch`,
      { method: 'POST', body: params },
      { fetchImpl },
    );
    const body = await response.json();
    sid = body.sid;
    if (!sid) {
      throw new GraphLensApiError('Splunk did not return a search job id.', { code: 'dispatch_failed' });
    }
    return sid;
  })();

  async function pollUntilDone() {
    const startedAt = Date.now();
    let intervalMs = DEFAULT_POLL_INTERVAL_MS;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (cancelled) {
        throw new GraphLensApiError('Search was cancelled.', { code: 'cancelled' });
      }
      if (Date.now() - startedAt > maxWaitMs) {
        await cancelJob(sid, { fetchImpl }).catch(() => {});
        throw new GraphLensApiError('Search timed out.', { code: 'timeout', retryable: true });
      }
      const response = await splunkFetch(
        `/services/search/jobs/${encodeURIComponent(sid)}?output_mode=json`,
        { method: 'GET' },
        { fetchImpl },
      );
      const body = await response.json();
      const entry = body.entry && body.entry[0];
      const content = entry && entry.content;
      if (!content) {
        throw new GraphLensApiError('Malformed search job status response.', { code: 'malformed_response' });
      }
      if (content.isFailed) {
        const messages = (content.messages || []).map((m) => m.text).join('; ');
        throw new GraphLensApiError(messages || 'The search failed.', { code: 'search_failed' });
      }
      if (content.dispatchState === 'DONE') {
        return content;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
      intervalMs = Math.min(MAX_POLL_INTERVAL_MS, intervalMs * 1.5);
    }
  }

  async function fetchResults({ count = 500, offset = 0 } = {}) {
    const response = await splunkFetch(
      `/services/search/jobs/${encodeURIComponent(sid)}/results?output_mode=json&count=${count}&offset=${offset}`,
      { method: 'GET' },
      { fetchImpl },
    );
    const body = await response.json();
    return {
      rows: body.results || [],
      fieldOrder: (body.fields || []).map((f) => f.name),
    };
  }

  async function waitForResults(resultOptions) {
    await dispatchPromise;
    await pollUntilDone();
    return fetchResults(resultOptions);
  }

  function cancel() {
    cancelled = true;
    if (sid) {
      return cancelJob(sid, { fetchImpl });
    }
    return dispatchPromise.then((resolvedSid) => cancelJob(resolvedSid, { fetchImpl })).catch(() => {});
  }

  return {
    get sid() {
      return sid;
    },
    waitForResults,
    cancel,
  };
}

export async function cancelJob(sid, { fetchImpl } = {}) {
  if (!sid) return;
  try {
    await splunkFetch(
      `/services/search/jobs/${encodeURIComponent(sid)}/control`,
      { method: 'POST', body: new URLSearchParams({ action: 'cancel', output_mode: 'json' }) },
      { fetchImpl },
    );
  } catch (err) {
    // Best-effort: a job that has already finished/expired 404s here,
    // which is not worth surfacing to the user.
  }
}
