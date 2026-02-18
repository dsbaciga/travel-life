import { create } from 'zustand';
import type { AxiosError } from 'axios';
import type { User, LoginInput, RegisterInput } from '../types/auth';
import authService from '../services/auth.service';
import { setAccessToken, registerAuthClearCallback } from '../lib/tokenManager';

interface ApiErrorData {
  message?: string;
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

      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<ApiErrorData>;
      const errorMessage = axiosErr.response?.data?.message || 'Login failed';
      set({ error: errorMessage, isLoading: false });
      throw err;
    }
  },

  register: async (data: RegisterInput) => {
    set({ isLoading: true, error: null });
    try {
      const response = await authService.register(data);

      setAccessToken(response.accessToken);

      set({
        user: response.user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err: unknown) {
      const axiosErr = err as AxiosError<ApiErrorData>;
      const errorMessage = axiosErr.response?.data?.message || 'Registration failed';
      set({ error: errorMessage, isLoading: false });
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
