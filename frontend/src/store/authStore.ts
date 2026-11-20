import { create } from 'zustand';
import { isAxiosError } from 'axios';
import type { User, LoginInput, RegisterInput } from '../types/auth';
import authService from '../services/auth.service';
import { setAccessToken, registerAuthClearCallback } from '../lib/tokenManager';
import { clearPersistedCache } from '../lib/queryPersister';
import { getQueryClient } from '../lib/queryClientSetup';
import { offlineService } from '../services/offline.service';
import offlineAuthService from '../services/offlineAuth.service';
import { usePdfImportTrackerStore } from './pdfImportTrackerStore';

interface ApiErrorData {
  message?: string;
}

/**
 * Message to surface for a failed auth call.
 *
 * Uses axios's own type guard rather than asserting the error shape: a thrown
 * value here can be anything (a network TypeError, a bug in an interceptor),
 * and asserting would read `.response` off a value that has no such property.
 */
function authErrorMessage(err: unknown, fallback: string): string {
  if (isAxiosError<ApiErrorData>(err)) {
    return err.response?.data?.message || fallback;
  }
  return fallback;
}

/**
 * Service worker Cache Storage buckets that must survive logout.
 *
 * Everything else in Cache Storage is either API responses or user media and
 * is therefore user data. The Workbox precache and the font caches hold only
 * static build assets, so wiping them would just force a needless re-download
 * (and break offline app-shell availability) without protecting anything.
 */
const PRESERVED_CACHE_NAMES = new Set(['google-fonts-cache', 'google-fonts-webfonts']);
const PRESERVED_CACHE_PREFIXES = ['workbox-precache'];

/**
 * Delete every service worker cache that can hold the previous user's data.
 */
async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;

  const names = await caches.keys();
  const userDataCaches = names.filter(
    (name) =>
      !PRESERVED_CACHE_NAMES.has(name) &&
      !PRESERVED_CACHE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );

  await Promise.all(userDataCaches.map((name) => caches.delete(name)));
}

/**
 * Clear all origin-scoped caches that can hold the signed-out user's data.
 *
 * None of this storage is user-scoped, so leaving it behind leaks one user's
 * trips, locations, photo metadata and API responses to the next user on a
 * shared device (PersistQueryClientProvider will happily rehydrate it).
 *
 * Every step is isolated: a failure in one must not block the others, and this
 * function never rejects, so it can never leave the user logged in.
 */
async function clearCachedUserData(
  options: { preserveSyncQueue?: boolean } = {}
): Promise<void> {
  const { preserveSyncQueue = false } = options;

  const steps: Array<[string, () => void | Promise<unknown>]> = [
    ['in-memory query cache', () => getQueryClient().clear()],
    ['persisted query cache', () => clearPersistedCache()],
    ['offline data cache', () => offlineService.clearAllCache()],
    ['offline auth session', () => offlineAuthService.clearOfflineSession()],
    ['service worker caches', () => clearServiceWorkerCaches()],
    ['PDF imports in progress', () => usePdfImportTrackerStore.getState().clear()],
  ];

  // The sync queue is unsynced *user work*, not a cache — the only copy of
  // edits made offline. It is dropped on a deliberate logout, but preserved
  // when the session ends involuntarily so a transient expiry does not destroy
  // it. `discardForeignSyncQueue` on the next sign-in stops a preserved queue
  // being replayed against a different account.
  if (!preserveSyncQueue) {
    steps.push(['offline sync queue', () => offlineService.clearSyncQueue()]);
  }

  await Promise.all(
    steps.map(async ([label, run]) => {
      try {
        await run();
      } catch (error) {
        console.error(`Failed to clear ${label} on logout:`, error);
      }
    })
  );
}

/**
 * Attribute the sync queue to the user who just signed in, discarding any
 * queue preserved from a different account. Never rejects — a failure here
 * must not block sign-in.
 */
async function claimSyncQueueForUser(userId: number): Promise<void> {
  try {
    const discarded = await offlineService.discardForeignSyncQueue(userId);
    if (discarded) {
      console.warn('Discarded a pending offline sync queue belonging to a different user.');
    }
    await offlineService.setSyncQueueOwner(userId);
  } catch (error) {
    console.error('Failed to reconcile the offline sync queue on sign-in:', error);
  }
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean; // Track if initial auth check is complete
  error: string | null;

  login: (data: LoginInput) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  initializeAuth: () => Promise<void>; // Silent refresh on page load
  updateUser: (user: Partial<User>) => void;
  clearError: () => void;
  clearAuth: () => void; // For use by axios interceptor
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isInitialized: false,
  error: null,

  login: async (data: LoginInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.login(data);

      // Store access token in memory only (via setAccessToken)
      setAccessToken(response.accessToken);

      await claimSyncQueueForUser(response.user.id);

      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      set({ error: authErrorMessage(err, 'Login failed'), isLoading: false });
      throw err;
    }
  },

  register: async (data: RegisterInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);

      setAccessToken(response.accessToken);

      await claimSyncQueueForUser(response.user.id);

      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      set({ error: authErrorMessage(err, 'Registration failed'), isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setAccessToken(null);
      set({
        user: null,
        isAuthenticated: false,
      });
      // Signed-out state is applied first so a failure here can never keep the
      // user logged in; clearCachedUserData swallows its own errors.
      await clearCachedUserData();
    }
  },

  // Called on app initialization (page load/refresh)
  initializeAuth: async () => {
    set({ isLoading: true });
    try {
      // Try silent refresh using httpOnly cookie
      const result = await authService.silentRefresh();

      if (result) {
        setAccessToken(result.accessToken);
        // Also reconcile here: a session restored by silent refresh is the
        // other way back in after an involuntary clearAuth preserved a queue.
        await claimSyncQueueForUser(result.user.id);
        set({
          user: result.user,
          isAuthenticated: true,
          isLoading: false,
          isInitialized: true,
        });
      } else {
        // No active session
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          isInitialized: true,
        });
      }
    } catch (error) {
      console.error('Auth initialization failed:', error);
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        isInitialized: true,
      });
    }
  },

  updateUser: (updatedFields: Partial<User>) => {
    set((state) => {
      if (!state.user) return state;
      return { user: { ...state.user, ...updatedFields } };
    });
  },

  clearError: () => set({ error: null }),

  // Called by axios interceptor when refresh fails
  clearAuth: () => {
    setAccessToken(null);
    set({
      user: null,
      isAuthenticated: false,
    });
    // Fire-and-forget: this is called synchronously from the axios interceptor,
    // so it must not block. clearCachedUserData never rejects.
    //
    // This path is involuntary — an expired or rejected refresh, not a user
    // choice — so the offline sync queue is kept. Wiping it here would silently
    // destroy edits the user made offline and has no other copy of.
    void clearCachedUserData({ preserveSyncQueue: true });
  },
}));

// Register the clearAuth callback to break the circular dependency
// axios.ts -> authStore.ts -> authService.ts -> axios.ts
// Now axios.ts can call triggerAuthClear() instead of importing authStore
registerAuthClearCallback(() => {
  useAuthStore.getState().clearAuth();
});

// Selectors for granular subscriptions (prevents unnecessary re-renders)
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useIsAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useIsAuthInitialized = () => useAuthStore((state) => state.isInitialized);
export const useAuthError = () => useAuthStore((state) => state.error);
export const useLogin = () => useAuthStore((state) => state.login);
export const useRegister = () => useAuthStore((state) => state.register);
export const useLogout = () => useAuthStore((state) => state.logout);
export const useInitializeAuth = () => useAuthStore((state) => state.initializeAuth);
export const useUpdateUser = () => useAuthStore((state) => state.updateUser);
export const useClearAuthError = () => useAuthStore((state) => state.clearError);
