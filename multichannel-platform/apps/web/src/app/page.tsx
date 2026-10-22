'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { SEVEN_DAYS_MS, useAuthStore } from '@/lib/store';

export default function RootPage() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);

  useEffect(() => {
    const token = localStorage.getItem('auth_access_token');
    const lastActiveStr = localStorage.getItem('auth_last_active_at');

    if (token) {
      if (lastActiveStr) {
        const lastActiveTime = parseInt(lastActiveStr, 10);
        const elapsed = Date.now() - lastActiveTime;
        if (!isNaN(lastActiveTime) && elapsed > SEVEN_DAYS_MS) {
          logout();
          return;
        }
      }
      // User visited within 7 days -> reset inactivity timer to restart 7-day countdown from 1
      localStorage.setItem('auth_last_active_at', Date.now().toString());
      router.replace('/dashboard');
    } else {
      router.replace('/login');
    }
  }, [router, logout]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400 text-sm">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        <span>Loading OmniChannel Hub...</span>
      </div>
    </div>
  );
}
