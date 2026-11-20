import dns from 'dns';
import http from 'http';
import https from 'https';
import type { LookupFunction } from 'net';
import { URL } from 'url';
import type { AxiosRequestConfig } from 'axios';
import { config } from '../config';
import {
  isLocalNetworkHostname,
  isPrivateIpAddress,
  validateUrlNotInternalSync,
} from './urlValidation';

/**
 * Request-time SSRF guard for integration URLs that users configure (Immich,
 * a per-user LLM endpoint).
 *
 * `validateUrlNotInternal()` checks a URL when it is saved, but DNS can change
 * afterwards: a hostname that resolved to a public address at save time can be
 * re-pointed at 127.0.0.1, 169.254.169.254 or a LAN host (DNS rebinding). This
 * module closes that gap by validating the address the socket actually
 * connects to. The agents below resolve the hostname themselves, reject any
 * private/internal result, and hand the checked address straight to the
 * socket, so there is no second lookup an attacker could answer differently.
 *
 * Instance-wide URLs the admin sets in the environment (`LLM_BASE_URL`) are
 * trusted and must not be routed through this guard.
 */

/** Error code set on lookups refused by the guard. */
export const PRIVATE_ADDRESS_ERROR_CODE = 'ERR_INTEGRATION_PRIVATE_ADDRESS';

function refusal(hostname: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(
    `Refusing to connect: ${hostname} resolves to a private or internal address`
  );
  err.code = PRIVATE_ADDRESS_ERROR_CODE;
  return err;
}

/**
 * A `net` lookup function that resolves like the default one but fails when
 * any resolved address is private or internal. Rejecting the whole answer
 * (not just filtering it) stops a record set that mixes a public and an
 * internal address from reaching the internal one on a retry or family
 * fallback.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) {
      callback(err, '', 0);
      return;
    }

    if (addresses.length === 0) {
      const notFound: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      notFound.code = 'ENOTFOUND';
      callback(notFound, '', 0);
      return;
    }

    if (addresses.some((entry) => isPrivateIpAddress(entry.address))) {
      callback(refusal(hostname), '', 0);
      return;
    }

    if (options.all) {
      // The callback's declared type only covers the single-address form;
      // with `all: true` Node expects the array instead.
      (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, addresses);
      return;
    }

    callback(null, addresses[0].address, addresses[0].family);
  });
};

// Shared across requests: the lookup is the same for every guarded URL.
const guardedHttpAgent = new http.Agent({ lookup: guardedLookup });
const guardedHttpsAgent = new https.Agent({ lookup: guardedLookup });

/**
 * Whether this URL may reach the operator's own network without the guard:
 * only when the admin enabled `ALLOW_PRIVATE_INTEGRATION_URLS` and the URL
 * names a LAN host directly (the same rule the save-time check applies).
 */
function isAllowedLocalTarget(url: URL): boolean {
  return config.security.allowPrivateIntegrationUrls && isLocalNetworkHostname(url.hostname);
}

/**
 * Axios options that make a request to a user-configured integration URL
 * safe against DNS rebinding. Spread them into the request (or instance)
 * config; keep `maxRedirects: 0` alongside, since a redirect could otherwise
 * point anywhere.
 *
 * - LAN escape hatch (see `isAllowedLocalTarget`): returns `{}`, a normal
 *   request.
 * - Otherwise: re-runs the static checks (scheme, blocked names, IP literals,
 *   which never reach a DNS lookup), then routes the request through agents
 *   whose lookup refuses private addresses. Proxies are disabled so the
 *   checked address is the one connected to.
 *
 * @throws AppError (400) when the URL fails the static checks.
 */
export function integrationRequestOptions(
  rawUrl: string
): Pick<AxiosRequestConfig, 'httpAgent' | 'httpsAgent' | 'proxy'> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    // Let the static validator produce the usual 400.
    validateUrlNotInternalSync(rawUrl);
    return {};
  }

  if (isAllowedLocalTarget(parsed)) return {};

  validateUrlNotInternalSync(parsed.toString());
  return { httpAgent: guardedHttpAgent, httpsAgent: guardedHttpsAgent, proxy: false };
}
