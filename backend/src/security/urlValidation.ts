import { AppError } from '../errors/errors';
import { URL } from 'url';
import dns from 'dns';
import { promisify } from 'util';
import net from 'net';

const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);

/**
 * Blocked hostname patterns for SSRF prevention.
 * Blocks localhost and common internal service names.
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google',
  'kubernetes.default',
  'kubernetes.default.svc',
];

/**
 * Whether a hostname names a machine on the operator's own network.
 *
 * This is the *opposite* judgement to `validateUrlNotInternal`, and exists for
 * the self-hosted integrations — Immich, a local LLM, a LAN SMTP relay — where
 * a private address is the primary deployment pattern rather than an attack.
 * Callers use it to skip SSRF validation deliberately, so it must stay
 * conservative:
 *
 * - IP literals qualify only when they are loopback or RFC1918 (checked as
 *   real addresses: a DNS name such as `10.evil.example.com` or
 *   `192.168.attacker.net` is NOT an IP and does not qualify);
 * - names qualify only when they are `localhost` or end in `.local`. A name
 *   can still resolve anywhere, so request-time code must restrict what it
 *   resolves to (see `integrationRequestGuard.ts`).
 *
 * Do not use this to decide that a URL is *safe*. It only says the operator
 * plausibly meant to reach their own network.
 */
export function isLocalNetworkHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (net.isIP(host)) return isLanIpAddress(host);
  return host === 'localhost' || host.endsWith('.local');
}

/**
 * Whether an IP address is loopback or RFC1918 private: the addresses a LAN
 * service legitimately lives on. Link-local (169.254/16, cloud metadata),
 * CGNAT, multicast, reserved and unspecified addresses are NOT LAN addresses.
 * IPv4-mapped IPv6 is judged by its embedded IPv4 address.
 */
export function isLanIpAddress(ip: string): boolean {
  const host = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');

  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }

  if (net.isIPv6(host)) {
    if (host === '::1') return true;
    const dotted = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isLanIpAddress(dotted[1]);
    const expanded = expandIPv6(host);
    if (expanded && expanded.substring(0, 24) === '0'.repeat(20) + 'ffff') {
      const embedded = [24, 26, 28, 30].map((i) => parseInt(expanded.substring(i, i + 2), 16)).join('.');
      return isLanIpAddress(embedded);
    }
  }

  return false;
}

/**
 * Check if an IPv4 address is in a private/internal range.
 *
 * Blocked ranges:
 * - 127.0.0.0/8         (loopback)
 * - 10.0.0.0/8          (private)
 * - 172.16.0.0/12       (private)
 * - 192.168.0.0/16      (private)
 * - 169.254.0.0/16      (link-local)
 * - 0.0.0.0/8           (unspecified)
 * - 255.255.255.255     (broadcast)
 * - 224.0.0.0/4         (multicast)
 * - 100.64.0.0/10       (shared address space / CGNAT)
 * - 240.0.0.0/4         (reserved)
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
    return true; // Treat malformed IPs as blocked
  }

  const [a, b] = parts;

  // 127.0.0.0/8 - loopback
  if (a === 127) return true;
  // 10.0.0.0/8 - private
  if (a === 10) return true;
  // 172.16.0.0/12 - private
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 - private
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 - link-local
  if (a === 169 && b === 254) return true;
  // 0.0.0.0/8 - unspecified
  if (a === 0) return true;
  // 255.255.255.255 - broadcast
  if (a === 255 && b === 255) return true;
  // 224.0.0.0/4 - multicast (224-239.x.x.x)
  if (a >= 224 && a <= 239) return true;
  // 100.64.0.0/10 - shared address space (CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 240.0.0.0/4 - reserved (240-255.x.x.x, except 255 already caught)
  if (a >= 240) return true;

  return false;
}

/**
 * Check if an IPv6 address is in a private/internal range.
 *
 * Blocked ranges:
 * - ::1           (loopback)
 * - ::            (unspecified)
 * - fc00::/7      (unique local addresses: fc00:: and fd00::)
 * - fe80::/10     (link-local)
 * - ::ffff:0:0/96 (IPv4-mapped, checked via mapped IPv4)
 */
function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();

  // Loopback
  if (normalized === '::1') return true;
  // Unspecified
  if (normalized === '::') return true;

  // IPv4-mapped IPv6 (e.g., ::ffff:192.168.1.1)
  const v4MappedMatch = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4MappedMatch) {
    return isPrivateIPv4(v4MappedMatch[1]);
  }

  // Expand the address to check prefix ranges
  const expanded = expandIPv6(normalized);
  if (!expanded) return true; // Treat unparseable as blocked

  // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible (::/96) addresses embed an
  // IPv4 address in the low 32 bits, and must be judged by that address.
  //
  // The dotted-form regex above is not enough on its own: the WHATWG URL parser
  // rewrites the hostname to hex before this module ever sees it, so
  // `http://[::ffff:127.0.0.1]/` arrives as `::ffff:7f00:1`. That fell through
  // to the prefix checks below, whose first word is 0x0000 — matching neither
  // fc00::/7 nor fe80::/10 — and was wrongly treated as public, allowing
  // loopback and RFC1918 targets straight through the SSRF guard.
  if (expanded.substring(0, 20) === '0'.repeat(20)) {
    const marker = expanded.substring(20, 24);

    if (marker === 'ffff') {
      const embeddedIPv4 = [
        parseInt(expanded.substring(24, 26), 16),
        parseInt(expanded.substring(26, 28), 16),
        parseInt(expanded.substring(28, 30), 16),
        parseInt(expanded.substring(30, 32), 16),
      ].join('.');
      return isPrivateIPv4(embeddedIPv4);
    }

    // ::/96 (IPv4-compatible) is deprecated and covers the unspecified range;
    // nothing legitimate should be fetched through it, so block outright.
    if (marker === '0000') return true;
  }

  const firstWord = parseInt(expanded.substring(0, 4), 16);

  // fc00::/7 - unique local (fc00:: through fdff::)
  if ((firstWord & 0xfe00) === 0xfc00) return true;
  // fe80::/10 - link-local
  if ((firstWord & 0xffc0) === 0xfe80) return true;

  return false;
}

/**
 * Expand an IPv6 address to its full 32-character hex representation.
 * Returns null if the address cannot be parsed.
 */
function expandIPv6(ip: string): string | null {
  try {
    // Use Node's net module to normalize
    if (!net.isIPv6(ip)) return null;

    // Split on :: to handle abbreviation
    const halves = ip.split('::');
    let groups: string[];

    if (halves.length === 2) {
      const left = halves[0] ? halves[0].split(':') : [];
      const right = halves[1] ? halves[1].split(':') : [];
      const missing = 8 - left.length - right.length;
      const middle = Array(missing).fill('0000');
      groups = [...left, ...middle, ...right];
    } else {
      groups = ip.split(':');
    }

    if (groups.length !== 8) return null;

    return groups.map(g => g.padStart(4, '0')).join('');
  } catch {
    return null;
  }
}

/**
 * Check if a hostname is an IP address literal (v4 or v6)
 * and whether it points to a private/internal range.
 */
function isPrivateIP(hostname: string): boolean {
  // Strip IPv6 brackets if present
  const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');

  if (net.isIPv4(cleanHost)) {
    return isPrivateIPv4(cleanHost);
  }

  if (net.isIPv6(cleanHost)) {
    return isPrivateIPv6(cleanHost);
  }

  return false;
}

/**
 * Whether an IP address (v4 or v6, brackets optional) is loopback, private,
 * link-local or otherwise internal. Non-IP strings return false.
 */
export function isPrivateIpAddress(ip: string): boolean {
  return isPrivateIP(ip);
}

/**
 * Validate a URL to prevent SSRF attacks.
 *
 * Checks:
 * 1. URL is well-formed (parseable by URL constructor)
 * 2. Only HTTP or HTTPS schemes are allowed
 * 3. Hostname is not a blocked internal name (localhost, metadata, etc.)
 * 4. Hostname IP literal is not in a private range
 * 5. DNS resolution of hostname does not resolve to a private IP
 *
 * @throws AppError with 400 status if validation fails
 */
export async function validateUrlNotInternal(url: string): Promise<void> {
  // Step 1: Parse the URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid URL format', 400);
  }

  // Step 2: Only allow http and https
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new AppError(
      'Only HTTP and HTTPS URLs are allowed',
      400
    );
  }

  // Step 3: Check for blocked hostnames
  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new AppError(
      'URLs pointing to localhost or internal services are not allowed',
      400
    );
  }

  // Also block any hostname ending with .local or .internal
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new AppError(
      'URLs pointing to internal hostnames are not allowed',
      400
    );
  }

  // Step 4: If the hostname is an IP literal, check it directly
  if (isPrivateIP(hostname)) {
    throw new AppError(
      'URLs pointing to private or internal IP addresses are not allowed',
      400
    );
  }

  // Step 5: Resolve the hostname and check resolved IPs to prevent DNS rebinding
  if (!net.isIP(hostname.replace(/^\[/, '').replace(/\]$/, ''))) {
    try {
      const resolvedIPs: string[] = [];

      try {
        const ipv4s = await dnsResolve4(hostname);
        resolvedIPs.push(...ipv4s);
      } catch {
        // No IPv4 records, continue
      }

      try {
        const ipv6s = await dnsResolve6(hostname);
        resolvedIPs.push(...ipv6s);
      } catch {
        // No IPv6 records, continue
      }

      if (resolvedIPs.length === 0) {
        throw new AppError(
          'Could not resolve hostname. Please check the URL.',
          400
        );
      }

      for (const ip of resolvedIPs) {
        if (net.isIPv4(ip) && isPrivateIPv4(ip)) {
          throw new AppError(
            'URL hostname resolves to a private or internal IP address',
            400
          );
        }
        if (net.isIPv6(ip) && isPrivateIPv6(ip)) {
          throw new AppError(
            'URL hostname resolves to a private or internal IP address',
            400
          );
        }
      }
    } catch (err) {
      // Re-throw AppErrors
      if (err instanceof AppError) throw err;
      // DNS resolution failed entirely
      throw new AppError(
        'Could not resolve hostname. Please check the URL.',
        400
      );
    }
  }
}

/**
 * Synchronous URL validation that checks everything except DNS resolution.
 * Use this for fast pre-checks; the full async version is preferred.
 *
 * @throws AppError with 400 status if validation fails
 */
export function validateUrlNotInternalSync(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new AppError('Invalid URL format', 400);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new AppError('Only HTTP and HTTPS URLs are allowed', 400);
  }

  const hostname = parsed.hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.includes(hostname)) {
    throw new AppError(
      'URLs pointing to localhost or internal services are not allowed',
      400
    );
  }

  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new AppError(
      'URLs pointing to internal hostnames are not allowed',
      400
    );
  }

  if (isPrivateIP(hostname)) {
    throw new AppError(
      'URLs pointing to private or internal IP addresses are not allowed',
      400
    );
  }
}
