/** Signed-out pages. A post-login redirect must never point at one of these. */
const AUTH_PAGE_PATHS = ['/login', '/register', '/accept-invite'];

/** Auth endpoints whose 401 means "bad credentials", not "expired session". */
const NO_REFRESH_ENDPOINTS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/silent-refresh',
  '/auth/oidc/',
  '/auth/mobile/pair',
];

export function isAuthPagePath(path: string): boolean {
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return AUTH_PAGE_PATHS.includes(pathname);
}

/** True when a 401 from this request URL must be shown to the caller as is. */
export function isCredentialEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split(/[?#]/)[0];
  return NO_REFRESH_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

/**
 * Same-origin path to go to after signing in. Falls back to `fallback` for
 * missing values, external or protocol-relative URLs and auth pages.
 */
export function safeRedirectPath(raw: string | null | undefined, fallback = '/dashboard'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) {
    return fallback;
  }
  return isAuthPagePath(raw) ? fallback : raw;
}
