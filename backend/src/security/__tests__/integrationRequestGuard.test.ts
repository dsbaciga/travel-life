/**
 * integrationRequestGuard Tests
 *
 * The request-time half of the SSRF guard for user-configured integration
 * URLs (Immich, per-user LLM). Save-time validation alone is defeated by DNS
 * rebinding: the hostname resolves to a public address when saved and to an
 * internal one later. These tests drive real axios requests through the
 * guarded agents against a real local HTTP server, with only DNS mocked, so
 * they prove the socket never reaches the internal target.
 *
 * Covers:
 * - Rebinding: save-time check passes (public answer), request-time answer is
 *   private, request refused and the server never sees it
 * - Mixed answers (one public, one private) are refused outright
 * - Public answers pass and the checked address is the one connected to
 * - IP literals and blocked names are refused without any DNS lookup
 * - LAN escape hatch: ALLOW_PRIVATE_INTEGRATION_URLS + a LAN host is allowed;
 *   with the flag off the same URL is refused
 * - Escape-hatch bypasses: DNS names that merely look like LAN IPs
 *   (`10.evil.example.com`) get no exemption, and `localhost`/`.local` names
 *   may resolve to LAN addresses but never to link-local/metadata
 */

import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import dns from 'dns';
import http from 'http';
import type { AddressInfo } from 'net';
import axios from 'axios';
import { config } from '../../config';
import {
  guardedLookup,
  lanLookup,
  integrationRequestOptions,
  PRIVATE_ADDRESS_ERROR_CODE,
} from '../integrationRequestGuard';
import { isLanIpAddress, isLocalNetworkHostname, validateUrlNotInternal } from '../urlValidation';

// urlValidation promisifies resolve4/resolve6 at import time, so DNS is
// replaced at module level (before any import) with functions that read the
// tables below. Node's own networking uses its internal resolver, untouched.
jest.mock('dns', () => {
  const actual = jest.requireActual<typeof import('dns')>('dns');
  return {
    ...actual,
    lookup: (hostname: string, _options: unknown, callback: LookupAllCallback) => {
      lookupCalls.push(hostname);
      const answer = lookupAnswers.get(hostname);
      if (!answer) {
        const err: NodeJS.ErrnoException = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
        err.code = 'ENOTFOUND';
        process.nextTick(() => callback(err, []));
        return;
      }
      process.nextTick(() => callback(null, answer));
    },
    resolve4: (hostname: string, callback: ResolveCallback) => {
      const answer = resolve4Answers.get(hostname);
      process.nextTick(() =>
        answer ? callback(null, answer) : callback(new Error('ENOTFOUND'), [])
      );
    },
    resolve6: (_hostname: string, callback: ResolveCallback) => {
      process.nextTick(() => callback(new Error('ENODATA'), []));
    },
  };
});

// ---------------------------------------------------------------------------
// A local server standing in for an internal service (cloud metadata, the
// database, a LAN admin page). Every request it receives is a guard failure
// unless the test expects it.
// ---------------------------------------------------------------------------

let server: http.Server;
let port: number;
let hits: number;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    hits += 1;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ reached: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

// ---------------------------------------------------------------------------
// DNS: `lookup` answers per hostname from a table; `resolve4/6` (used by the
// save-time validator) answer from a separate table, so a test can give the
// two phases different answers, which is exactly what a rebinding attack does.
// ---------------------------------------------------------------------------

const lookupAnswers = new Map<string, dns.LookupAddress[]>();
const resolve4Answers = new Map<string, string[]>();
const lookupCalls: string[] = [];

type LookupAllCallback = (err: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void;
type ResolveCallback = (err: Error | null, addresses: string[]) => void;

beforeEach(() => {
  hits = 0;
  lookupAnswers.clear();
  resolve4Answers.clear();
  lookupCalls.length = 0;
  config.security.allowPrivateIntegrationUrls = false;
});

afterEach(() => {
  config.security.allowPrivateIntegrationUrls = false;
});

const v4 = (address: string): dns.LookupAddress => ({ address, family: 4 });

function guardedGet(url: string) {
  return axios.get(url, { timeout: 5000, maxRedirects: 0, ...integrationRequestOptions(url) });
}

describe('integrationRequestGuard', () => {
  describe('DNS rebinding', () => {
    it('refuses a hostname that was public at save time and is private at request time', async () => {
      const url = `http://rebind.example.com:${port}/api/server/ping`;

      // Save time: the attacker's record points at a public address.
      resolve4Answers.set('rebind.example.com', ['93.184.216.34']);
      await expect(validateUrlNotInternal(url)).resolves.toBeUndefined();

      // Later: the record is re-pointed at loopback (where our server listens).
      lookupAnswers.set('rebind.example.com', [v4('127.0.0.1')]);

      await expect(guardedGet(url)).rejects.toMatchObject({ code: PRIVATE_ADDRESS_ERROR_CODE });
      expect(hits).toBe(0);
    });

    it('refuses cloud metadata (169.254.169.254) reached through a rebound name', async () => {
      lookupAnswers.set('meta.example.com', [v4('169.254.169.254')]);

      await expect(guardedGet('http://meta.example.com/latest/meta-data/')).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
    });

    it('refuses an answer that mixes a public and a private address', async () => {
      lookupAnswers.set('mixed.example.com', [v4('93.184.216.34'), v4('127.0.0.1')]);

      await expect(guardedGet(`http://mixed.example.com:${port}/`)).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
      expect(hits).toBe(0);
    });

    it('refuses an IPv6 private answer', async () => {
      lookupAnswers.set('v6.example.com', [{ address: 'fd00::1', family: 6 }]);

      await expect(guardedGet('http://v6.example.com/')).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
    });
  });

  describe('guardedLookup', () => {
    it('returns the checked public address in single-address form', async () => {
      lookupAnswers.set('public.example.com', [v4('93.184.216.34')]);

      const result = await new Promise<{ address: string; family: number }>((resolve, reject) => {
        guardedLookup('public.example.com', {}, (err, address, family) => {
          if (err) reject(err);
          else resolve({ address: address as string, family: family as number });
        });
      });

      expect(result).toEqual({ address: '93.184.216.34', family: 4 });
    });

    it('returns every checked address when called with all: true', async () => {
      lookupAnswers.set('public.example.com', [v4('93.184.216.34'), v4('93.184.216.35')]);

      const result = await new Promise<unknown>((resolve, reject) => {
        guardedLookup('public.example.com', { all: true }, (err, addresses) => {
          if (err) reject(err);
          else resolve(addresses);
        });
      });

      expect(result).toEqual([v4('93.184.216.34'), v4('93.184.216.35')]);
    });

    it('passes DNS failures through unchanged', async () => {
      const err = await new Promise<NodeJS.ErrnoException | null>((resolve) => {
        guardedLookup('missing.example.com', {}, (e) => resolve(e));
      });

      expect(err?.code).toBe('ENOTFOUND');
    });
  });

  describe('static checks at request time', () => {
    it('refuses a loopback IP literal without a DNS lookup', () => {
      expect(() => integrationRequestOptions(`http://127.0.0.1:${port}/`)).toThrow(
        /private or internal IP/
      );
      expect(lookupCalls).toEqual([]);
    });

    it('refuses the metadata IP literal', () => {
      expect(() => integrationRequestOptions('http://169.254.169.254/')).toThrow(
        /private or internal IP/
      );
    });

    it('refuses blocked hostnames', () => {
      expect(() => integrationRequestOptions('http://localhost:2283')).toThrow(/localhost/);
      expect(() => integrationRequestOptions('http://immich.internal')).toThrow(/internal hostnames/);
    });

    it('refuses malformed URLs and non-HTTP schemes', () => {
      expect(() => integrationRequestOptions('not a url')).toThrow(/Invalid URL/);
      expect(() => integrationRequestOptions('file:///etc/passwd')).toThrow(/HTTP and HTTPS/);
    });

    it('routes public URLs through the guarded agents with proxies disabled', () => {
      const options = integrationRequestOptions('https://immich.example.com');

      expect(options.httpAgent).toBeInstanceOf(http.Agent);
      expect(options.httpsAgent).toBeDefined();
      expect(options.proxy).toBe(false);
    });
  });

  describe('LAN escape hatch (ALLOW_PRIVATE_INTEGRATION_URLS)', () => {
    it('allows a LAN address when the flag is on', async () => {
      config.security.allowPrivateIntegrationUrls = true;

      expect(integrationRequestOptions(`http://127.0.0.1:${port}/`)).toEqual({});
      const response = await guardedGet(`http://127.0.0.1:${port}/api/server/ping`);

      expect(response.data).toEqual({ reached: true });
      expect(hits).toBe(1);
    });

    it('allows RFC1918 and .local hosts when the flag is on', () => {
      config.security.allowPrivateIntegrationUrls = true;

      expect(integrationRequestOptions('http://192.168.1.20:2283')).toEqual({});
      expect(integrationRequestOptions('http://10.0.0.5:11434/v1')).toEqual({});
      // A name, not an IP: it still goes through the LAN-policy agents.
      const named = integrationRequestOptions('http://nas.local:2283');
      expect(named.httpAgent).toBeDefined();
      expect(named.proxy).toBe(false);
    });

    it('still guards a public hostname when the flag is on', async () => {
      config.security.allowPrivateIntegrationUrls = true;
      lookupAnswers.set('rebind.example.com', [v4('127.0.0.1')]);

      await expect(guardedGet(`http://rebind.example.com:${port}/`)).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
      expect(hits).toBe(0);
    });

    it('gives no exemption to DNS names that look like LAN IPs', async () => {
      config.security.allowPrivateIntegrationUrls = true;
      lookupAnswers.set('10.evil.example.com', [v4('169.254.169.254')]);
      lookupAnswers.set('192.168.attacker.net', [v4('127.0.0.1')]);

      expect(integrationRequestOptions('http://10.evil.example.com/').httpAgent).toBeDefined();
      await expect(guardedGet('http://10.evil.example.com/latest/meta-data/')).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
      await expect(guardedGet(`http://192.168.attacker.net:${port}/`)).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
      expect(hits).toBe(0);
    });

    it('lets a .local name reach a LAN address when the flag is on', async () => {
      config.security.allowPrivateIntegrationUrls = true;
      lookupAnswers.set('nas.local', [v4('127.0.0.1')]);

      const response = await guardedGet(`http://nas.local:${port}/api/server/ping`);

      expect(response.data).toEqual({ reached: true });
      expect(hits).toBe(1);
    });

    it('refuses a .local name that resolves to link-local / metadata', async () => {
      config.security.allowPrivateIntegrationUrls = true;
      lookupAnswers.set('evil.local', [v4('169.254.169.254')]);
      lookupAnswers.set('cgnat.local', [v4('100.64.0.1')]);

      await expect(guardedGet('http://evil.local/latest/meta-data/')).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
      await expect(guardedGet('http://cgnat.local/')).rejects.toMatchObject({
        code: PRIVATE_ADDRESS_ERROR_CODE,
      });
    });

    it('lanLookup accepts public, loopback and RFC1918 answers only', async () => {
      const run = (host: string) =>
        new Promise<NodeJS.ErrnoException | null>((resolve) => {
          lanLookup(host, {}, (err) => resolve(err));
        });
      lookupAnswers.set('a.local', [v4('93.184.216.34')]);
      lookupAnswers.set('b.local', [v4('192.168.1.20'), v4('10.0.0.5')]);
      lookupAnswers.set('c.local', [v4('192.168.1.20'), v4('169.254.1.1')]);

      expect(await run('a.local')).toBeNull();
      expect(await run('b.local')).toBeNull();
      expect((await run('c.local'))?.code).toBe(PRIVATE_ADDRESS_ERROR_CODE);
    });

    it('refuses the same LAN address once the flag is off', () => {
      expect(() => integrationRequestOptions('http://192.168.1.20:2283')).toThrow(
        /private or internal IP/
      );
    });
  });

  describe('isLocalNetworkHostname / isLanIpAddress', () => {
    it('accepts loopback and RFC1918 IP literals', () => {
      for (const host of ['127.0.0.1', '10.0.0.5', '172.16.0.1', '172.31.255.255', '192.168.1.20', '::1', '[::1]', '::ffff:192.168.1.20']) {
        expect(isLocalNetworkHostname(host)).toBe(true);
      }
    });

    it('accepts localhost and .local names', () => {
      expect(isLocalNetworkHostname('localhost')).toBe(true);
      expect(isLocalNetworkHostname('NAS.local')).toBe(true);
    });

    it('rejects DNS names that only start like a LAN IP', () => {
      for (const host of ['10.evil.example.com', '192.168.attacker.net', '172.16.x.example.org', '127.0.0.1.nip.io']) {
        expect(isLocalNetworkHostname(host)).toBe(false);
      }
    });

    it('rejects non-LAN internal addresses', () => {
      for (const ip of ['169.254.169.254', '100.64.0.1', '0.0.0.0', '172.32.0.1', 'fe80::1', '::ffff:169.254.169.254']) {
        expect(isLanIpAddress(ip)).toBe(false);
        expect(isLocalNetworkHostname(ip)).toBe(false);
      }
    });
  });
});
