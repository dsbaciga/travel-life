/**
 * Who is signed in, and to which server.
 *
 * Tokens live only in the OS keystore (`expo-secure-store`): Keychain on iOS,
 * Keystore-backed storage on Android. They are never written to SQLite,
 * AsyncStorage or logs.
 */
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import type { MobileAuthResponse } from '@travel-life/shared';
import { pairingQrSchema } from '@travel-life/shared';
import { wipe } from '../db/schema';
import { createApiClient, normalizeServerUrl, type Session } from './apiClient';
import { getDb } from './db';

const SESSION_KEY = 'travel-life.session';

export type SessionUser = MobileAuthResponse['user'];

interface StoredSession extends Session {
  user: SessionUser;
}

interface SessionState {
  /** False until the keystore has been read on launch. */
  hydrated: boolean;
  session: StoredSession | null;
  hydrate(): Promise<void>;
  signInWithPassword(serverUrl: string, email: string, password: string): Promise<void>;
  signInWithPairingPayload(raw: string): Promise<void>;
  signInWithOidcCode(serverUrl: string, code: string, codeVerifier: string): Promise<void>;
  signOut(): Promise<void>;
}

async function persist(session: StoredSession | null): Promise<void> {
  if (session) {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session), {
      // Readable by the background location task after the first unlock, but
      // never restored onto another device from a backup.
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

export const useSession = create<SessionState>((set, get) => {
  const adopt = async (serverUrl: string, auth: MobileAuthResponse): Promise<void> => {
    const previous = get().session;
    // A different account or server must not inherit the last one's mirror.
    if (previous && (previous.user.id !== auth.user.id || previous.serverUrl !== serverUrl)) {
      await wipe(await getDb());
    }
    const session: StoredSession = {
      serverUrl,
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      user: auth.user,
    };
    await persist(session);
    set({ session });
  };

  return {
    hydrated: false,
    session: null,

    async hydrate() {
      try {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        set({ session: raw ? (JSON.parse(raw) as StoredSession) : null, hydrated: true });
      } catch {
        // An unreadable keystore entry is treated as signed out.
        set({ session: null, hydrated: true });
      }
    },

    async signInWithPassword(serverUrl, email, password) {
      const base = normalizeServerUrl(serverUrl);
      const auth = await api.request<MobileAuthResponse>('/auth/login', {
        method: 'POST',
        anonymous: true,
        serverUrl: base,
        body: { email, password },
      });
      await adopt(base, auth);
    },

    async signInWithPairingPayload(raw) {
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error('That QR code is not a Travel Life pairing code.');
      }
      const parsed = pairingQrSchema.safeParse(json);
      if (!parsed.success) {
        throw new Error('That QR code is not a Travel Life pairing code.');
      }
      const base = normalizeServerUrl(parsed.data.serverUrl);
      const auth = await api.request<MobileAuthResponse>('/auth/mobile/pair', {
        method: 'POST',
        anonymous: true,
        serverUrl: base,
        body: { pairingToken: parsed.data.pairingToken },
      });
      await adopt(base, auth);
    },

    async signInWithOidcCode(serverUrl, code, codeVerifier) {
      const base = normalizeServerUrl(serverUrl);
      const auth = await api.request<MobileAuthResponse>('/auth/oidc/mobile-exchange', {
        method: 'POST',
        anonymous: true,
        serverUrl: base,
        body: { code, codeVerifier },
      });
      await adopt(base, auth);
    },

    async signOut() {
      const current = get().session;
      if (current) {
        // Best effort: revoke server-side, but never trap the user in a
        // signed-in state because the server is unreachable.
        await api
          .request('/auth/logout', { method: 'POST', body: { refreshToken: current.refreshToken } })
          .catch(() => undefined);
      }
      await persist(null);
      await wipe(await getDb());
      set({ session: null });
    },
  };
});

/** The app-wide API client, wired to the session store. */
export const api = createApiClient({
  fetch: (input, init) => fetch(input, init),
  getSession: () => useSession.getState().session,
  async saveTokens(tokens) {
    const current = useSession.getState().session;
    if (!current) return;
    const next = { ...current, ...tokens };
    await persist(next);
    useSession.setState({ session: next });
  },
  async onSessionExpired() {
    // Keep the local mirror: unsynced edits survive a re-login as the same user.
    await persist(null);
    useSession.setState({ session: null });
  },
});

/** Check that a URL is a Travel Life server before asking for credentials. */
export async function checkServer(
  serverUrl: string
): Promise<{ ok: boolean; oidcEnabled: boolean; oidcButtonText: string; passwordLoginDisabled: boolean }> {
  const config = await api.request<{
    enabled: boolean;
    buttonText: string;
    passwordLoginDisabled: boolean;
  }>('/auth/oidc/config', { anonymous: true, serverUrl: normalizeServerUrl(serverUrl) });
  return {
    ok: true,
    oidcEnabled: Boolean(config?.enabled),
    oidcButtonText: config?.buttonText ?? 'Sign in with SSO',
    passwordLoginDisabled: Boolean(config?.passwordLoginDisabled),
  };
}
