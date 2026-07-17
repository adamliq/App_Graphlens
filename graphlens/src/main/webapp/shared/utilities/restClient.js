/**
 * Shared low-level client for Splunk's documented REST API
 * (services/search/jobs, services/storage/collections/data/*,
 * services/properties/*). Both searchService.js and kvStoreService.js sit
 * on top of this so there is exactly one place that knows how to reach
 * splunkd, attach the CSRF token, and turn a non-2xx response into a safe,
 * user-facing error.
 */

export class GraphLensApiError extends Error {
  constructor(message, { code = 'api_error', retryable = false, cause } = {}) {
    super(message);
    this.name = 'GraphLensApiError';
    this.code = code;
    this.retryable = retryable;
    this.cause = cause;
  }
}

export function getCsrfToken() {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)splunkweb_csrf_token_[^=]*=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function getSplunkdPath() {
  // Splunk Web injects window.$C with runtime config (mount path, locale,
  // app name) into every rendered page; this is the supported way for
  // in-app JavaScript to build a same-origin URL back to splunkd.
  const config = typeof window !== 'undefined' ? window.$C : undefined;
  const root = (config && config.MRSPARKLE_ROOT_PATH) || '';
  const locale = (config && config.LOCALE) || 'en-US';
  return `${root}/${locale}/splunkd/__raw`.replace(/\/{2,}/g, '/');
}

export function getCurrentUsername() {
  const config = typeof window !== 'undefined' ? window.$C : undefined;
  return (config && config.USERNAME) || 'unknown';
}

export function getCurrentApp() {
  const config = typeof window !== 'undefined' ? window.$C : undefined;
  return (config && config.LOCALE_APP) || 'graphlens';
}

/**
 * @param {string} path - path under splunkd, e.g. "/services/search/jobs".
 * @param {RequestInit} init
 * @param {{fetchImpl?: typeof fetch}} [deps]
 */
export async function splunkFetch(path, init = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl || (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchImpl) {
    throw new GraphLensApiError('No fetch implementation available.', { code: 'no_fetch' });
  }
  const url = `${getSplunkdPath()}${path}`;
  const csrfToken = getCsrfToken();
  const response = await fetchImpl(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      ...(csrfToken ? { 'X-Splunk-Form-Key': csrfToken } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new GraphLensApiError('You do not have permission to perform this action.', { code: 'forbidden' });
    }
    if (response.status === 404) {
      throw new GraphLensApiError('The requested resource was not found.', { code: 'not_found' });
    }
    if (response.status === 409) {
      throw new GraphLensApiError('That record was changed by someone else. Reload and try again.', { code: 'conflict' });
    }
    if (response.status >= 500) {
      throw new GraphLensApiError('Splunk is temporarily unavailable.', { code: 'server_error', retryable: true });
    }
    let detail = '';
    try {
      const body = await response.json();
      detail = (body && body.messages && body.messages.map((m) => m.text).join('; ')) || '';
    } catch (err) {
      // response body was not JSON; fall through with the generic message
    }
    throw new GraphLensApiError(detail || 'The request was rejected.', { code: 'bad_request' });
  }
  return response;
}

/** Normalises any thrown error into a shape safe to show to end users (no stack traces, no internal detail). */
export function toUserFacingError(err) {
  if (err instanceof GraphLensApiError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }
  return { code: 'unknown_error', message: 'Something went wrong. Please try again.', retryable: false };
}
