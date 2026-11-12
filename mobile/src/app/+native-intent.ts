/**
 * Incoming links that are not screens.
 *
 * The single sign-on redirect (`travellife://auth/oidc?...`) is a message to
 * the sign-in call waiting on the onboarding screen, which reads it from the
 * browser session's result. Without this, the router would also try to open
 * it as a route and land on "Unmatched Route".
 */
const AUTH_CALLBACK = /^(?:[a-z][a-z0-9+.-]*:\/*)?\/?auth\/oidc(?:[/?#]|$)/i;

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    // Null keeps the app on whatever screen it is already showing.
    return AUTH_CALLBACK.test(path) ? null : path;
  } catch {
    return path;
  }
}
