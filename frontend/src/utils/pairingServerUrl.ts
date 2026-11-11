/**
 * The address the phone should use for this server.
 *
 * The server reports its configured BASE_URL, but a self-hosted install that
 * never set it reports `http://localhost:5000` — useless from a phone. When
 * that happens and the web app itself is being served from a real host, the
 * origin the user is looking at right now is the better answer.
 */
export function resolvePairingServerUrl(reported: string, currentOrigin: string): string {
  const isLoopback = (url: string): boolean => {
    try {
      const { hostname } = new URL(url);
      return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    } catch {
      return true;
    }
  };
  const cleaned = reported.replace(/\/+$/, '');
  if (isLoopback(cleaned) && !isLoopback(currentOrigin)) {
    return currentOrigin.replace(/\/+$/, '');
  }
  return cleaned;
}
