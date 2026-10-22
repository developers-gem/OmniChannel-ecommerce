import { create } from 'zustand';

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface AuthState {
  user: User | null;
  organization: Organization | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (user: User, organization: Organization, token: string, refreshToken?: string) => void;
  updateTokens: (accessToken: string, refreshToken?: string) => void;
  touchActivity: () => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  organization: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (user, organization, token, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_access_token', token);
      if (refreshToken) {
        localStorage.setItem('auth_refresh_token', refreshToken);
      }
      localStorage.setItem('auth_user', JSON.stringify({ user, organization }));
      localStorage.setItem('auth_last_active_at', Date.now().toString());
    }
    set({
      user,
      organization,
      accessToken: token,
      refreshToken: refreshToken || null,
      isAuthenticated: true,
    });
  },

  updateTokens: (accessToken, refreshToken) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_access_token', accessToken);
      if (refreshToken) {
        localStorage.setItem('auth_refresh_token', refreshToken);
      }
      localStorage.setItem('auth_last_active_at', Date.now().toString());
    }
    set((state) => ({
      accessToken,
      refreshToken: refreshToken || state.refreshToken,
    }));
  },

  touchActivity: () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_last_active_at', Date.now().toString());
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_access_token');
      localStorage.removeItem('auth_refresh_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth_last_active_at');
    }
    set({
      user: null,
      organization: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
    });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  initialize: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_access_token');
      const refreshToken = localStorage.getItem('auth_refresh_token');
      const cached = localStorage.getItem('auth_user');
      const lastActiveStr = localStorage.getItem('auth_last_active_at');

      if (!token || !cached) {
        return;
      }

      // 7-day inactivity sliding session check
      if (lastActiveStr) {
        const lastActiveTime = parseInt(lastActiveStr, 10);
        const elapsed = Date.now() - lastActiveTime;
        if (!isNaN(lastActiveTime) && elapsed > SEVEN_DAYS_MS) {
          // 7 days have passed without visiting the platform -> log out
          get().logout();
          return;
        }
      }

      // User visited within 7 days -> reset inactivity timer to restart 7-day count from 1
      localStorage.setItem('auth_last_active_at', Date.now().toString());

      try {
        const { user, organization } = JSON.parse(cached);
        set({
          user,
          organization,
          accessToken: token,
          refreshToken: refreshToken || null,
          isAuthenticated: true,
        });
      } catch (e) {
        get().logout();
      }
    }
  },
}));
