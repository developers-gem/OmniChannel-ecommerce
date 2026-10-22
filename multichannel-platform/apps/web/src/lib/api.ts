import axios, { InternalAxiosRequestConfig } from 'axios';
import { SEVEN_DAYS_MS, useAuthStore } from './store';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5050/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

function clearAuthAndRedirect() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_access_token');
    localStorage.removeItem('auth_refresh_token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('auth_last_active_at');
    if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/register')) {
      window.location.href = '/login';
    }
  }
}

// Request Interceptor: Check 7-day inactivity and reset sliding counter on activity
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_access_token');
      const lastActiveStr = localStorage.getItem('auth_last_active_at');

      if (token) {
        // Verify 7-day inactivity sliding window
        if (lastActiveStr) {
          const lastActiveTime = parseInt(lastActiveStr, 10);
          const elapsed = Date.now() - lastActiveTime;
          if (!isNaN(lastActiveTime) && elapsed > SEVEN_DAYS_MS) {
            clearAuthAndRedirect();
            return Promise.reject(new Error('Session expired after 7 days of inactivity'));
          }
        }

        // Active request made within 7 days -> reset sliding session counter to restart 7-day countdown
        localStorage.setItem('auth_last_active_at', Date.now().toString());
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: refresh tokens transparently on 401 if within 7-day window
api.interceptors.response.use(
  (response) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_last_active_at', Date.now().toString());
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Don't intercept auth endpoints
      const url = originalRequest?.url || '';
      if (
        url.includes('/auth/login') ||
        url.includes('/auth/register') ||
        url.includes('/auth/refresh') ||
        window.location.pathname.startsWith('/login') ||
        window.location.pathname.startsWith('/register')
      ) {
        return Promise.reject(error.response?.data?.error || error);
      }

      // Check 7-day inactivity window
      const lastActiveStr = localStorage.getItem('auth_last_active_at');
      if (lastActiveStr) {
        const lastActiveTime = parseInt(lastActiveStr, 10);
        const elapsed = Date.now() - lastActiveTime;
        if (!isNaN(lastActiveTime) && elapsed > SEVEN_DAYS_MS) {
          clearAuthAndRedirect();
          return Promise.reject(new Error('Session expired after 7 days of inactivity'));
        }
      }

      if (originalRequest._retry) {
        clearAuthAndRedirect();
        return Promise.reject(error.response?.data?.error || error);
      }

      const refreshToken = localStorage.getItem('auth_refresh_token');
      if (!refreshToken) {
        clearAuthAndRedirect();
        return Promise.reject(error.response?.data?.error || error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((newToken) => {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshResponse = await axios.post(`${API_BASE_URL}/auth/refresh`, {
          refreshToken,
        });

        const tokens = refreshResponse.data?.data?.tokens;
        if (tokens?.accessToken) {
          localStorage.setItem('auth_access_token', tokens.accessToken);
          if (tokens.refreshToken) {
            localStorage.setItem('auth_refresh_token', tokens.refreshToken);
          }
          localStorage.setItem('auth_last_active_at', Date.now().toString());

          try {
            useAuthStore.getState().updateTokens(tokens.accessToken, tokens.refreshToken);
          } catch (e) {
            // Zustand store update fallback
          }

          api.defaults.headers.common.Authorization = `Bearer ${tokens.accessToken}`;
          originalRequest.headers.Authorization = `Bearer ${tokens.accessToken}`;

          processQueue(null, tokens.accessToken);
          return api(originalRequest);
        } else {
          throw new Error('Refresh response missing access token');
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuthAndRedirect();
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error.response?.data?.error || error);
  }
);
