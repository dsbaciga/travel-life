export const NETWORK_ERROR_MESSAGE = "Can't reach the server. Check your connection and try again.";
export const OFFLINE_ERROR_MESSAGE = "You're offline. Reconnect and try again.";

/** True for an axios error whose request got no response at all (not a cancel or a timeout). */
function isNetworkError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  if (!('isAxiosError' in err) || err.isAxiosError !== true) return false;
  if ('response' in err && err.response) return false;
  const code = 'code' in err ? err.code : undefined;
  return code !== 'ERR_CANCELED' && code !== 'ECONNABORTED';
}

/**
 * Extract a human-readable message from a rejected API call.
 *
 * Services reject with axios errors carrying `response.data.message` from the backend's
 * `{ status, message }` envelope, but a thrown value is `unknown` — it may be a network
 * error, a DOMException from an aborted request, or anything else. This narrows
 * structurally with `in` and `typeof` checks rather than asserting a shape that may not
 * be there, so a malformed error falls back instead of yielding `undefined` at runtime.
 *
 * When the request never reached the server (a dropped connection, a server that is
 * down) there is no response to read, so the message says so instead of reusing the
 * per-call fallback, which would hide the real cause.
 *
 * @param err - The caught value
 * @param fallback - Message to use when the error carries no usable message
 */
export function getApiErrorMessage(err: unknown, fallback: string): string {
  if (isNetworkError(err)) {
    return typeof navigator !== 'undefined' && navigator.onLine === false
      ? OFFLINE_ERROR_MESSAGE
      : NETWORK_ERROR_MESSAGE;
  }

  if (typeof err !== 'object' || err === null || !('response' in err)) {
    return fallback;
  }

  const { response } = err;
  if (typeof response !== 'object' || response === null || !('data' in response)) {
    return fallback;
  }

  const { data } = response;
  if (typeof data !== 'object' || data === null || !('message' in data)) {
    return fallback;
  }

  return typeof data.message === 'string' && data.message ? data.message : fallback;
}
