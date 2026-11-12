/**
 * HTTP client for the Travel Life API.
 *
 * Native-client contract (see backend `auth/clientPlatform.ts`):
 * - every request carries `X-Client-Platform: mobile` and a bearer token;
 * - no cookies are sent, which is what exempts these requests from CSRF;
 * - refresh tokens travel in JSON bodies and are single-use, so concurrent
 *   401s must share ONE refresh call — two would replay the old token, which
 *   the server treats as theft and answers by revoking every session.
 *
 * `fetch` and token storage are injected, so this file has no native imports
 * and is unit-tested in Node.
 */

import type { MobileAuthResponse, MobileSyncSnapshot } from '@travel-life/shared';
import { ApiError, type SyncApi } from '../sync/engine';
import type { ApiRequest } from '../sync/payloads';

export interface Session {
  serverUrl: string;
  accessToken: string;
  refreshToken: string;
}

export interface ApiClientDeps {
  fetch: typeof fetch;
  getSession(): Session | null;
  /** Persist a rotated token pair. */
  saveTokens(tokens: { accessToken: string; refreshToken: string }): Promise<void>;
  /** The refresh token was rejected: the session is over. */
  onSessionExpired(): Promise<void> | void;
  /** Milliseconds before a request is abandoned (default 30 s). */
  timeoutMs?: number;
}

interface Envelope<T> {
  status?: string;
  data?: T;
  message?: string;
}

/** `https://host/` or `https://host/api` -> `https://host/api`. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  return /\/api$/i.test(url) ? url : `${url}/api`;
}

/** Origin for `/uploads/...` paths, which live beside `/api`, not under it. */
export function assetBaseUrl(serverUrl: string): string {
  return normalizeServerUrl(serverUrl).replace(/\/api$/i, '');
}

async function parseBody<T>(response: Response): Promise<Envelope<T> | null> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as Envelope<T>;
  } catch {
    return null;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Multipart body; `body` fields are added as form fields. */
  upload?: { uri: string; name: string; type: string; fieldName?: string };
  query?: Record<string, string | undefined>;
  /** Skip the bearer token (login, pairing, health). */
  anonymous?: boolean;
  /** Override the stored server (onboarding, before a session exists). */
  serverUrl?: string;
}

export function createApiClient(deps: ApiClientDeps) {
  const timeoutMs = deps.timeoutMs ?? 30000;
  let refreshing: Promise<boolean> | null = null;

  async function send(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await deps.fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      // Offline, DNS failure, TLS failure and timeout all look the same to the
      // sync engine: "not reachable, try later".
      throw new ApiError(error instanceof Error ? error.message : 'Network request failed', null);
    } finally {
      clearTimeout(timer);
    }
  }

  function buildInit(options: RequestOptions, accessToken: string | null): RequestInit {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Client-Platform': 'mobile',
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    let body: BodyInit | undefined;
    if (options.upload) {
      const form = new FormData();
      // React Native's FormData accepts this file descriptor shape.
      const { fieldName = 'photo', ...file } = options.upload;
      form.append(fieldName, file as unknown as Blob);
      for (const [key, value] of Object.entries((options.body ?? {}) as Record<string, unknown>)) {
        if (value !== null && value !== undefined) form.append(key, String(value));
      }
      body = form;
      // No Content-Type: the runtime must add the multipart boundary itself.
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    return { method: options.method ?? 'GET', headers, body };
  }

  function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
    const params = Object.entries(query ?? {})
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
    return `${normalizeServerUrl(base)}${path}${params ? `?${params}` : ''}`;
  }

  /** Rotate the token pair. Resolves false when the session is gone. */
  async function refreshTokens(): Promise<boolean> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      const session = deps.getSession();
      if (!session) return false;
      const response = await send(buildUrl(session.serverUrl, '/auth/refresh'), {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Client-Platform': 'mobile',
        },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });
      if (response.status === 401 || response.status === 403) {
        await deps.onSessionExpired();
        return false;
      }
      if (!response.ok) {
        // Server trouble is not a verdict on the token: keep the session.
        throw new ApiError(`Token refresh failed (${response.status})`, response.status);
      }
      const parsed = await parseBody<Partial<MobileAuthResponse>>(response);
      const data = parsed?.data;
      if (!data?.accessToken || !data.refreshToken) {
        throw new ApiError('Token refresh returned no tokens', 502);
      }
      await deps.saveTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return true;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const session = deps.getSession();
    const base = options.serverUrl ?? session?.serverUrl;
    if (!base) throw new ApiError('No server configured', null);
    if (!options.anonymous && !session) throw new ApiError('Not signed in', 401);

    const url = buildUrl(base, path, options.query);
    let response = await send(
      url,
      buildInit(options, options.anonymous ? null : (session?.accessToken ?? null))
    );

    if (response.status === 401 && !options.anonymous) {
      const refreshed = await refreshTokens();
      if (!refreshed) throw new ApiError('Session expired', 401);
      response = await send(url, buildInit(options, deps.getSession()?.accessToken ?? null));
    }

    const parsed = await parseBody<T>(response);
    if (!response.ok) {
      throw new ApiError(parsed?.message ?? `Request failed (${response.status})`, response.status);
    }
    // 204s and non-enveloped bodies yield undefined data.
    return (parsed?.data ?? null) as T;
  }

  const syncApi: SyncApi = {
    request<T>(req: ApiRequest): Promise<T> {
      return request<T>(req.path, { method: req.method, body: req.body, upload: req.upload });
    },
    getSnapshot(tripId: number, since?: string): Promise<MobileSyncSnapshot> {
      return request<MobileSyncSnapshot>(`/trips/${tripId}/mobile-sync`, { query: { since } });
    },
  };

  return { request, refreshTokens, syncApi };
}

export type ApiClient = ReturnType<typeof createApiClient>;
