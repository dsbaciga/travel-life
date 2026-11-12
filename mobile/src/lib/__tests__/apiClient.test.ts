/**
 * API client tests
 *
 * Test cases:
 * - API-001: Requests carry the bearer token and mobile platform header, and unwrap the envelope
 * - API-002: Server URL normalisation and asset base
 * - API-003: A 401 refreshes once and retries with the new token
 * - API-004: Concurrent 401s share a single refresh (single-use refresh tokens)
 * - API-005: A rejected refresh ends the session and surfaces 401
 * - API-006: A refresh that fails with a server error keeps the session
 * - API-007: Network failures become ApiError with a null status
 * - API-008: Error responses carry the server message and status
 * - API-009: Anonymous requests send no token and never trigger a refresh
 * - API-010: Uploads are multipart with form fields and no JSON content type
 * - API-011: syncApi maps ApiRequest and snapshot calls; query values are encoded
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../sync/engine';
import { assetBaseUrl, createApiClient, normalizeServerUrl, type Session } from '../apiClient';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiClient', () => {
  let session: Session | null;
  let calls: Call[];
  let handler: (call: Call) => Response | Promise<Response>;
  const saveTokens = vi.fn(async (tokens: { accessToken: string; refreshToken: string }) => {
    if (session) session = { ...session, ...tokens };
  });
  const onSessionExpired = vi.fn(async () => {
    session = null;
  });

  const make = () =>
    createApiClient({
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const call: Call = {
          url: String(input),
          method: init?.method ?? 'GET',
          headers: (init?.headers ?? {}) as Record<string, string>,
          body: init?.body,
        };
        calls.push(call);
        return handler(call);
      }) as typeof fetch,
      getSession: () => session,
      saveTokens,
      onSessionExpired,
    });

  beforeEach(() => {
    vi.clearAllMocks();
    calls = [];
    session = { serverUrl: 'https://travel.example.com', accessToken: 'access-1', refreshToken: 'refresh-1' };
    handler = () => json(200, { status: 'success', data: { ok: true } });
  });

  it('API-001: bearer token, platform header, envelope unwrap', async () => {
    const result = await make().request<{ ok: boolean }>('/trips', { method: 'POST', body: { title: 'x' } });

    expect(result).toEqual({ ok: true });
    expect(calls[0].url).toBe('https://travel.example.com/api/trips');
    expect(calls[0].headers).toMatchObject({
      Authorization: 'Bearer access-1',
      'X-Client-Platform': 'mobile',
      'Content-Type': 'application/json',
    });
    expect(calls[0].body).toBe('{"title":"x"}');
    // No cookies are ever attached: that is what exempts the app from CSRF.
    expect(Object.keys(calls[0].headers).map((h) => h.toLowerCase())).not.toContain('cookie');
  });

  it('API-002: server URL normalisation and asset base', () => {
    expect(normalizeServerUrl('travel.example.com')).toBe('https://travel.example.com/api');
    expect(normalizeServerUrl(' https://travel.example.com/ ')).toBe('https://travel.example.com/api');
    expect(normalizeServerUrl('http://192.168.1.5:5000/api/')).toBe('http://192.168.1.5:5000/api');
    expect(assetBaseUrl('https://travel.example.com/api')).toBe('https://travel.example.com');
  });

  it('API-003: a 401 refreshes once and retries with the new token', async () => {
    handler = (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        expect(JSON.parse(call.body as string)).toEqual({ refreshToken: 'refresh-1' });
        expect(call.headers['X-Client-Platform']).toBe('mobile');
        return json(200, { status: 'success', data: { accessToken: 'access-2', refreshToken: 'refresh-2' } });
      }
      return call.headers.Authorization === 'Bearer access-2'
        ? json(200, { status: 'success', data: 'fresh' })
        : json(401, { status: 'error', message: 'Token expired' });
    };

    await expect(make().request('/trips')).resolves.toBe('fresh');
    expect(saveTokens).toHaveBeenCalledWith({ accessToken: 'access-2', refreshToken: 'refresh-2' });
    expect(calls.map((c) => c.url.replace('https://travel.example.com/api', ''))).toEqual([
      '/trips',
      '/auth/refresh',
      '/trips',
    ]);
  });

  it('API-004: concurrent 401s share a single refresh', async () => {
    let refreshCalls = 0;
    handler = async (call) => {
      if (call.url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return json(200, { status: 'success', data: { accessToken: 'access-2', refreshToken: 'refresh-2' } });
      }
      return call.headers.Authorization === 'Bearer access-2'
        ? json(200, { status: 'success', data: call.url })
        : json(401, { status: 'error' });
    };
    const client = make();

    const results = await Promise.all([client.request('/a'), client.request('/b'), client.request('/c')]);

    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    expect(session?.refreshToken).toBe('refresh-2');
  });

  it('API-005: a rejected refresh ends the session and surfaces 401', async () => {
    handler = () => json(401, { status: 'error', message: 'Invalid refresh token' });

    await expect(make().request('/trips')).rejects.toMatchObject({ status: 401 });
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(saveTokens).not.toHaveBeenCalled();
  });

  it('API-006: a refresh that fails with a server error keeps the session', async () => {
    handler = (call) =>
      call.url.endsWith('/auth/refresh') ? json(503, { status: 'error' }) : json(401, { status: 'error' });

    await expect(make().request('/trips')).rejects.toMatchObject({ status: 503 });
    expect(onSessionExpired).not.toHaveBeenCalled();
    expect(session?.refreshToken).toBe('refresh-1');
  });

  it('API-007: network failures become ApiError with a null status', async () => {
    handler = () => {
      throw new TypeError('Network request failed');
    };
    const error = await make().request('/trips').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBeNull();
  });

  it('API-008: error responses carry the server message and status', async () => {
    handler = () => json(403, { status: 'error', message: 'Insufficient permissions' });
    await expect(make().request('/trips/1')).rejects.toMatchObject({
      status: 403,
      message: 'Insufficient permissions',
    });
    // A non-JSON error page still produces a typed error.
    handler = () => new Response('<html>Bad Gateway</html>', { status: 502 });
    await expect(make().request('/trips/1')).rejects.toMatchObject({ status: 502 });
  });

  it('API-009: anonymous requests send no token and never trigger a refresh', async () => {
    session = null;
    handler = () => json(401, { status: 'error', message: 'Invalid email or password' });

    await expect(
      make().request('/auth/login', {
        method: 'POST',
        anonymous: true,
        serverUrl: 'https://other.example.com',
        body: { email: 'a@b.c', password: 'x' },
      })
    ).rejects.toMatchObject({ status: 401, message: 'Invalid email or password' });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://other.example.com/api/auth/login');
    expect(calls[0].headers.Authorization).toBeUndefined();
    // Without a session an authenticated call fails locally.
    await expect(make().request('/trips', { serverUrl: 'https://other.example.com' })).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(1);
  });

  it('API-010: uploads are multipart with form fields and no JSON content type', async () => {
    await make().syncApi.request({
      method: 'POST',
      path: '/photos/upload',
      body: { tripId: 10, caption: 'Canal', latitude: null },
      upload: { uri: 'file:///x.jpg', name: 'x.jpg', type: 'image/jpeg' },
    });

    expect(calls[0].body).toBeInstanceOf(FormData);
    const form = calls[0].body as FormData;
    expect(form.get('tripId')).toBe('10');
    expect(form.get('caption')).toBe('Canal');
    expect(form.has('latitude')).toBe(false);
    expect(form.has('photo')).toBe(true);
    expect(calls[0].headers['Content-Type']).toBeUndefined();
  });

  it('API-011: syncApi maps requests and snapshot calls; query values are encoded', async () => {
    const client = make();
    await client.syncApi.request({ method: 'DELETE', path: '/activities/5' });
    await client.syncApi.getSnapshot(10, '2026-06-01T08:00:00.000Z');
    await client.syncApi.getSnapshot(10);

    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'https://travel.example.com/api/activities/5' });
    expect(calls[1].url).toBe(
      'https://travel.example.com/api/trips/10/mobile-sync?since=2026-06-01T08%3A00%3A00.000Z'
    );
    expect(calls[2].url).toBe('https://travel.example.com/api/trips/10/mobile-sync');
  });
});
