import { create } from 'zustand';

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
  isAuthenticated: boolean;
  setAuth: (user: User, organization: Organization, token: string) => void;
  logout: () => void;
  initialize: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  organization: null,
  accessToken: null,
  isAuthenticated: false,

  setAuth: (user, organization, token) => {
    localStorage.setItem('auth_access_token', token);
    localStorage.setItem('auth_user', JSON.stringify({ user, organization }));
    set({
      user,
      organization,
      accessToken: token,
      isAuthenticated: true,
    });
  },

  logout: () => {
    localStorage.removeItem('auth_access_token');
    localStorage.removeItem('auth_user');
    set({
      user: null,
      organization: null,
      accessToken: null,
      isAuthenticated: false,
    });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  initialize: () => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_access_token');
      const cached = localStorage.getItem('auth_user');
      if (token && cached) {
        try {
          const { user, organization } = JSON.parse(cached);
          set({
            user,
            organization,
            accessToken: token,
            isAuthenticated: true,
          });
        } catch (e) {
          localStorage.removeItem('auth_access_token');
          localStorage.removeItem('auth_user');
        }
      }
    }
  },
}));
