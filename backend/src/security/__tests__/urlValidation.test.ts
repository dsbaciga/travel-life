/**
 * urlValidation Tests
 *
 * Direct coverage for the SSRF guard that sits behind both the Immich LAN
 * finding and the DNS-rebinding finding. DNS is fully mocked, so no test here
 * touches the network.
 *
 * Covers:
 * - URL shape guards (malformed input, non-HTTP schemes)
 * - Blocked hostnames (localhost, cloud/k8s metadata names, .local/.internal)
 * - IPv4 literals: loopback, RFC1918, link-local (169.254.169.254), CGNAT,
 *   multicast, reserved, broadcast, unspecified
 * - IPv6 literals: ::1, ::, fc00::/7, fe80::/10, IPv4-mapped
 * - Genuinely public addresses and hostnames are allowed
 * - DNS rebinding: a public hostname that RESOLVES to a private IP is rejected
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// DNS mock — callback-style so util.promisify wraps it the same way the module
// under test does at import time.
// ---------------------------------------------------------------------------

type DnsAnswer = { addresses: string[] } | { error: Error };

const dnsV4Answers = new Map<string, DnsAnswer>();
const dnsV6Answers = new Map<string, DnsAnswer>();

const notFound = (hostname: string): NodeJS.ErrnoException => {
  const err: NodeJS.ErrnoException = new Error(`queryA ENOTFOUND ${hostname}`);
  err.code = 'ENOTFOUND';
  return err;
};

type DnsCallback = (err: Error | null, addresses?: string[]) => void;
type DnsResolver = (hostname: string, callback: DnsCallback) => void;

const makeResolver = (table: Map<string, DnsAnswer>): DnsResolver =>
  (hostname, callback) => {
    const answer = table.get(hostname);
    if (answer && 'addresses' in answer) {
      callback(null, answer.addresses);
      return;
    }
    callback(answer && 'error' in answer ? answer.error : notFound(hostname));
  };

const mockResolve4 = jest.fn<DnsResolver>(makeResolver(dnsV4Answers));
const mockResolve6 = jest.fn<DnsResolver>(makeResolver(dnsV6Answers));

jest.mock('dns', () => ({
  resolve4: (hostname: string, callback: DnsCallback) => mockResolve4(hostname, callback),
  resolve6: (hostname: string, callback: DnsCallback) => mockResolve6(hostname, callback),
}));

import { validateUrlNotInternal, validateUrlNotInternalSync } from '../urlValidation';
import { AppError } from '../../errors/errors';

/** Register DNS answers for a hostname. */
const setDns = (hostname: string, v4: string[] | null, v6: string[] | null = null): void => {
  if (v4) dnsV4Answers.set(hostname, { addresses: v4 });
  if (v6) dnsV6Answers.set(hostname, { addresses: v6 });
};

/** Assert that a URL is rejected, and return the thrown AppError for inspection. */
const expectRejected = async (url: string): Promise<AppError> => {
  let thrown: unknown;
  try {
    await validateUrlNotInternal(url);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).statusCode).toBe(400);
  return thrown as AppError;
};

/** Assert that the synchronous variant rejects. */
const expectRejectedSync = (url: string): AppError => {
  let thrown: unknown;
  try {
    validateUrlNotInternalSync(url);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(AppError);
  expect((thrown as AppError).statusCode).toBe(400);
  return thrown as AppError;
};

beforeEach(() => {
  dnsV4Answers.clear();
  dnsV6Answers.clear();
  mockResolve4.mockClear();
  mockResolve6.mockClear();
});

// ===========================================================================
// URL shape guards
// ===========================================================================

describe('validateUrlNotInternal — URL shape guards', () => {
  it.each([
    ['not-a-url'],
    [''],
    ['http://'],
    ['://example.com'],
    ['   '],
  ])('rejects malformed input %p as an invalid URL', async (url) => {
    const error = await expectRejected(url);
    expect(error.message).toBe('Enter a full URL, like https://example.com.');
  });

  it.each([
    ['file:///etc/passwd'],
    ['ftp://example.com/x'],
    ['gopher://example.com/'],
    ['javascript:alert(1)'],
    ['data:text/plain,hello'],
    ['ws://example.com/socket'],
  ])('rejects non-HTTP scheme %p', async (url) => {
    const error = await expectRejected(url);
    expect(error.message).toBe('Use a web address that starts with http:// or https://.');
  });

  it('does not attempt DNS resolution when the scheme is rejected', async () => {
    await expectRejected('file://example.com/x');
    expect(mockResolve4).not.toHaveBeenCalled();
    expect(mockResolve6).not.toHaveBeenCalled();
  });

  it('accepts an uppercase HTTPS scheme', async () => {
    setDns('example.com', ['93.184.216.34']);
    await expect(validateUrlNotInternal('HTTPS://example.com/photos')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// Blocked hostnames
// ===========================================================================

describe('validateUrlNotInternal — blocked hostnames', () => {
  it.each([
    ['http://localhost:2283/api'],
    ['https://localhost'],
    ['http://LOCALHOST/'],
    ['http://localhost.localdomain/'],
    ['http://metadata.google.internal/computeMetadata/v1/'],
    ['http://kubernetes.default/'],
    ['http://kubernetes.default.svc/'],
  ])('rejects internal service name %p', async (url) => {
    const error = await expectRejected(url);
    expect(error.message).toMatch(/localhost or internal services|internal hostnames/);
    // Blocked before any DNS lookup happens.
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  it.each([
    ['http://immich.local:2283/'],
    ['http://NAS.LOCAL/'],
    ['http://service.internal/'],
  ])('rejects mDNS/internal suffix hostname %p', async (url) => {
    const error = await expectRejected(url);
    expect(error.message).toBe('URLs pointing to internal hostnames are not allowed');
  });

  it('does not reject a public hostname that merely contains "local"', async () => {
    setDns('localhost.example.com', ['93.184.216.34']);
    await expect(
      validateUrlNotInternal('http://localhost.example.com/')
    ).resolves.toBeUndefined();
  });
});

// ===========================================================================
// IPv4 literals
// ===========================================================================

describe('validateUrlNotInternal — IPv4 literals', () => {
  const privateIPv4 = [
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback (whole /8)'],
    ['10.0.0.1', 'RFC1918 10/8'],
    ['10.255.255.254', 'RFC1918 10/8 upper'],
    ['172.16.0.1', 'RFC1918 172.16/12 lower bound'],
    ['172.20.10.5', 'RFC1918 172.16/12 middle'],
    ['172.31.255.254', 'RFC1918 172.16/12 upper bound'],
    ['192.168.0.1', 'RFC1918 192.168/16'],
    ['192.168.1.254', 'RFC1918 192.168/16'],
    ['169.254.169.254', 'link-local cloud metadata'],
    ['169.254.0.1', 'link-local'],
    ['0.0.0.0', 'unspecified'],
    ['255.255.255.255', 'broadcast'],
    ['224.0.0.1', 'multicast'],
    ['239.255.255.250', 'multicast (SSDP)'],
    ['100.64.0.1', 'CGNAT'],
    ['100.127.255.255', 'CGNAT upper'],
    ['240.0.0.1', 'reserved'],
  ] as const;

  it.each(privateIPv4)('rejects %s (%s)', async (ip) => {
    const error = await expectRejected(`http://${ip}:2283/api/albums`);
    expect(error.message).toBe(
      'URLs pointing to private or internal IP addresses are not allowed'
    );
    expect(mockResolve4).not.toHaveBeenCalled();
  });

  const publicIPv4 = [
    ['8.8.8.8', 'Google DNS'],
    ['93.184.216.34', 'example.com'],
    ['172.15.255.255', 'just below the 172.16/12 block'],
    ['172.32.0.1', 'just above the 172.16/12 block'],
    ['192.167.1.1', 'just below 192.168/16'],
    ['192.169.1.1', 'just above 192.168/16'],
    ['169.253.0.1', 'just below link-local'],
    ['169.255.0.1', 'just above link-local'],
    ['100.63.255.255', 'just below CGNAT'],
    ['100.128.0.1', 'just above CGNAT'],
    ['223.255.255.255', 'just below multicast'],
    ['1.1.1.1', 'Cloudflare DNS'],
  ] as const;

  it.each(publicIPv4)('accepts public address %s (%s)', async (ip) => {
    await expect(validateUrlNotInternal(`https://${ip}/api`)).resolves.toBeUndefined();
    // An IP literal must not trigger a DNS lookup.
    expect(mockResolve4).not.toHaveBeenCalled();
    expect(mockResolve6).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// IPv6 literals
// ===========================================================================

describe('validateUrlNotInternal — IPv6 literals', () => {
  it.each([
    ['[::1]', 'loopback'],
    ['[::]', 'unspecified'],
    ['[fc00::1]', 'unique local fc00::/8'],
    ['[fd12:3456:789a::1]', 'unique local fd00::/8'],
    ['[fe80::1]', 'link-local'],
    ['[fe80::200:5aee:feaa:20a2]', 'link-local EUI-64'],
  ])('rejects %s (%s)', async (host) => {
    const error = await expectRejected(`http://${host}:2283/`);
    expect(error.message).toBe(
      'URLs pointing to private or internal IP addresses are not allowed'
    );
  });

  it.each([
    ['[2001:4860:4860::8888]', 'Google public DNS v6'],
    ['[2606:4700:4700::1111]', 'Cloudflare public DNS v6'],
    ['[::ffff:93.184.216.34]', 'IPv4-mapped public'],
  ])('accepts public %s (%s)', async (host) => {
    await expect(validateUrlNotInternal(`https://${host}/api`)).resolves.toBeUndefined();
    expect(mockResolve6).not.toHaveBeenCalled();
  });

  it('classifies an IPv4-mapped private address supplied as a DNS answer as private', async () => {
    // isPrivateIPv6 handles the dotted ::ffff:a.b.c.d form; resolved addresses
    // reach it verbatim (unlike URL hostnames, which the WHATWG URL parser
    // rewrites into hex form before this module ever sees them).
    setDns('mapped.example.com', null, ['::ffff:192.168.1.1']);

    const error = await expectRejected('https://mapped.example.com/');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });
});

// ===========================================================================
// DNS resolution / rebinding
// ===========================================================================

describe('validateUrlNotInternal — DNS resolution', () => {
  it('accepts a hostname that resolves only to public addresses', async () => {
    setDns('immich.example.com', ['93.184.216.34'], ['2606:2800:220:1:248:1893:25c8:1946']);

    await expect(
      validateUrlNotInternal('https://immich.example.com/api')
    ).resolves.toBeUndefined();

    expect(mockResolve4).toHaveBeenCalledTimes(1);
    expect(mockResolve6).toHaveBeenCalledTimes(1);
  });

  it('rejects a public-looking hostname that resolves to loopback (DNS rebinding)', async () => {
    setDns('rebind.example.com', ['127.0.0.1']);

    const error = await expectRejected('https://rebind.example.com/api');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });

  it('rejects a hostname that resolves to an RFC1918 address', async () => {
    setDns('nas.example.com', ['192.168.1.50']);

    const error = await expectRejected('http://nas.example.com:2283/api');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });

  it('rejects a hostname that resolves to the cloud metadata address', async () => {
    setDns('metadata.example.com', ['169.254.169.254']);

    const error = await expectRejected('http://metadata.example.com/latest/meta-data/');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });

  it('rejects when only ONE of several A records is private', async () => {
    setDns('mixed.example.com', ['93.184.216.34', '10.0.0.5']);

    const error = await expectRejected('https://mixed.example.com/');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });

  it('rejects when the AAAA record is private but the A record is public', async () => {
    setDns('v6private.example.com', ['93.184.216.34'], ['fd00::1']);

    const error = await expectRejected('https://v6private.example.com/');
    expect(error.message).toBe(
      'URL hostname resolves to a private or internal IP address'
    );
  });

  it('rejects a hostname with no A and no AAAA records', async () => {
    const error = await expectRejected('https://nxdomain.example.com/');
    expect(error.message).toBe('Could not resolve hostname. Please check the URL.');
  });

  it('accepts a hostname with only AAAA records', async () => {
    setDns('v6only.example.com', null, ['2606:4700:4700::1111']);

    await expect(validateUrlNotInternal('https://v6only.example.com/')).resolves.toBeUndefined();
  });
});

// ===========================================================================
// Synchronous variant
// ===========================================================================

describe('validateUrlNotInternalSync', () => {
  it('performs the same shape, hostname and IP-literal checks without DNS', () => {
    expect(expectRejectedSync('not-a-url').message).toBe('Enter a full URL, like https://example.com.');
    expect(expectRejectedSync('file:///etc/passwd').message).toBe(
      'Use a web address that starts with http:// or https://.'
    );
    expect(expectRejectedSync('http://localhost:2283/').message).toBe(
      'URLs pointing to localhost or internal services are not allowed'
    );
    expect(expectRejectedSync('http://immich.local/').message).toBe(
      'URLs pointing to internal hostnames are not allowed'
    );
    expect(expectRejectedSync('http://192.168.1.10/').message).toBe(
      'URLs pointing to private or internal IP addresses are not allowed'
    );
    expect(expectRejectedSync('http://[::1]/').message).toBe(
      'URLs pointing to private or internal IP addresses are not allowed'
    );
  });

  it('accepts a public URL and never touches DNS', () => {
    expect(() => validateUrlNotInternalSync('https://immich.example.com/api')).not.toThrow();
    expect(() => validateUrlNotInternalSync('https://8.8.8.8/api')).not.toThrow();
    expect(mockResolve4).not.toHaveBeenCalled();
    expect(mockResolve6).not.toHaveBeenCalled();
  });

  it('cannot catch DNS rebinding — the async variant is required for that', async () => {
    setDns('rebind.example.com', ['127.0.0.1']);

    // Sync check passes: the hostname is not a literal and is not blocked by name.
    expect(() => validateUrlNotInternalSync('https://rebind.example.com/')).not.toThrow();
    // The async check is the one that catches it.
    await expectRejected('https://rebind.example.com/');
  });
});
