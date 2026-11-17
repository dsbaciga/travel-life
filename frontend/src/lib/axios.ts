import axios from 'axios';
import type { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getCsrfToken } from '../utils/csrf';
import { isAuthPagePath, isCredentialEndpoint } from './authRedirect';
import { getAccessToken, setAccessToken, triggerAuthClear } from './tokenManager';

export { getAccessToken, setAccessToken };

const API_URL = import.meta.env.VITE_API_URL || '/api';

// Retry configuration for rate limiting (429) errors
const MAX_RETRIES = 4;
const INITIAL_RETRY_DELAY = 1000; // 1 second

interface RetryConfig extends InternalAxiosRequestConfig {
  _retryCount?: number;
  _retry?: boolean;
}

// Helper to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Refresh race condition protection
// When multiple 401s occur simultaneously, only one refresh happens
let isRefreshing = false;
let refreshSubscribers: { resolve: (token: string) => void; reject: (error: Error) => void }[] = [];

const subscribeTokenRefresh = (
  resolve: (token: string) => void,
  reject: (error: Error) => void
) => {
  refreshSubscribers.push({ resolve, reject });
};

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach(({ resolve }) => resolve(token));
  refreshSubscribers = [];
};

const onRefreshFailed = (error: Error) => {
  refreshSubscribers.forEach(({ reject }) => reject(error));
  refreshSubscribers = [];
};

const axiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 120000, // 2 minutes default timeout
  withCredentials: true, // CRITICAL: Send cookies with requests
});

// Request interceptor to add auth token from memory and CSRF token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests (non-GET/HEAD/OPTIONS)
    if (config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        config.headers['x-csrf-token'] = csrfToken;
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to unwrap standardized API responses
// Backend wraps all responses as { status: 'success', data: ... }
// This interceptor extracts the inner `data` so services can use response.data directly
axiosInstance.interceptors.response.use(
  (response) => {
    if (
      response.data &&
      typeof response.data === 'object' &&
      response.data.status === 'success' &&
      'data' in response.data
    ) {
      response.data = response.data.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryConfig;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    // Handle rate limiting (429 Too Many Requests) with exponential backoff
    if (error.response?.status === 429) {
      const retryCount = originalRequest._retryCount || 0;

      if (retryCount < MAX_RETRIES) {
        originalRequest._retryCount = retryCount + 1;

        // Calculate delay with exponential backoff: 1s, 2s, 4s, 8s
        const retryDelay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);

        console.log(`Rate limited (429). Retrying in ${retryDelay}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`);

        await delay(retryDelay);
        return axiosInstance(originalRequest);
      }

      console.error(`Rate limit retry exhausted after ${MAX_RETRIES} attempts`);
    }

    // Handle 401 (Unauthorized) - try cookie-based refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isCredentialEndpoint(originalRequest.url)
    ) {
      // If a refresh is already in progress, wait for it to complete
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh(
            (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(axiosInstance(originalRequest));
            },
            (error: Error) => {
              reject(error);
            }
          );
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Refresh using httpOnly cookie (no body needed, cookie is sent automatically)
        const { data } = await axios.post(
          `${API_URL}/auth/refresh`,
          {},
          { withCredentials: true }
        );

        const newAccessToken = data.data?.accessToken;
        if (newAccessToken) {
          setAccessToken(newAccessToken);
          isRefreshing = false;
          onRefreshed(newAccessToken);
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return axiosInstance(originalRequest);
        }
        throw new Error('No access token in refresh response');
      } catch (refreshError) {
        // Refresh failed - notify subscribers, clear token, and redirect
        isRefreshing = false;
        onRefreshFailed(refreshError instanceof Error ? refreshError : new Error('Token refresh failed'));
        setAccessToken(null);

        // Clear auth state using callback (avoids circular dependency)
        triggerAuthClear();

        // Preserve the current URL for redirect after login
        const currentPath = window.location.pathname + window.location.search;
        if (isAuthPagePath(currentPath)) {
          return Promise.reject(refreshError);
        }
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
