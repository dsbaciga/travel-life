import { Request } from 'express';

/** Header a native client sends to opt in to body-delivered refresh tokens. */
export const CLIENT_PLATFORM_HEADER = 'x-client-platform';

/**
 * True when the request declares itself as coming from the native companion app.
 *
 * A native client has no cookie jar worth trusting and stores tokens in the OS
 * keychain instead, so for these requests the auth endpoints return the refresh
 * token in the JSON body and set **no** cookies. Browsers never send this
 * header themselves; a page that added it via fetch would only obtain the
 * refresh token of the session it already controls, so the header grants no
 * new capability.
 */
export const isMobileClient = (req: Request): boolean => {
  const value = req.headers[CLIENT_PLATFORM_HEADER];
  return typeof value === 'string' && value.trim().toLowerCase() === 'mobile';
};
