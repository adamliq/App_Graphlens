/**
 * Dispatches GraphLens's Splunk searches through the supported REST search
 * API (services/search/jobs, services/saved/searches/*) and normalises
 * polling, cancellation, timeouts and errors.
 *
 * Two dispatch modes:
 *  - dispatchSavedSearch: names a saved search (default/savedsearches.conf)
 *    with no dynamic tokens of its own (graphlens_health,
 *    graphlens_graph_statistics).
 *  - dispatchAdHocSearch: sends a complete SPL string built by
 *    services/splTemplates.js from already-validated/escaped values. This
 *    is the path used for every search that needs a per-request value
 *    (entity search, expand, evidence, ...) - see splTemplates.js's module
 *    doc comment for why saved-search `args.<token>` substitution could
 *    not be used for those (confirmed against a live Splunk instance; it
 *    silently does not substitute `$token$` placeholders in the saved
 *    search's own SPL).
 *
 * Both share the same poll/cancel/timeout/error-normalisation machinery
 * below so behaviour is identical regardless of how the job was started.
 */
import { splunkFetch, GraphLensApiError, toUserFacingError } from '../utilities/restClient';

export { toUserFacingError };
export const GraphLensSearchError = GraphLensApiError;

const DEFAULT_POLL_INTERVAL_MS = 500;
const MAX_POLL_INTERVAL_MS = 4000;

/** Shared poll/results/cancel machinery for a job whose sid is produced by `startJob`. */
function createJobHandle(startJob, { maxWaitMs = 30000, fetchImpl } = {}) {
  let cancelled = false;
  let sid;

  const dispatchPromise = (async () => {
    sid = await startJob();
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
 * Dispatch a saved search by name. Only use this for a saved search with
 * no dynamic `$token$` values of its own (graphlens_health,
 * graphlens_graph_statistics) - see the module doc comment.
 * Returns a handle exposing `sid`, `waitForResults()` and `cancel()`.
 */
export function dispatchSavedSearch(savedSearchName, tokens = {}, options = {}) {
  const { earliest, latest, maxResultRows, fetchImpl } = options;
  return createJobHandle(async () => {
    const params = buildDispatchArgs(tokens, { earliest, latest, maxResultRows });
    const response = await splunkFetch(
      `/services/saved/searches/${encodeURIComponent(savedSearchName)}/dispatch`,
      { method: 'POST', body: params },
      { fetchImpl },
    );
    const body = await response.json();
    return body.sid;
  }, options);
}

/**
 * Dispatch a complete, pre-built SPL string as an ad-hoc search (every
 * value in `searchString` must already have been validated/escaped by the
 * caller - see splTemplates.js). `searchString` must start with the
 * literal `search` keyword (or another generating command); Splunk's job
 * endpoint rejects a bare macro/filter expression with no leading command.
 */
export function dispatchAdHocSearch(searchString, options = {}) {
  const { earliest, latest, maxResultRows, fetchImpl } = options;
  return createJobHandle(async () => {
    const params = buildDispatchArgs({}, { earliest, latest, maxResultRows });
    params.set('search', searchString);
    const response = await splunkFetch(
      '/services/search/jobs',
      { method: 'POST', body: params },
      { fetchImpl },
    );
    const body = await response.json();
    return body.sid;
  }, options);
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
