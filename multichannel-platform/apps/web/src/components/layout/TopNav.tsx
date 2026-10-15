'use client';

import React from 'react';
import { useAuthStore } from '@/lib/store';
import { Bell, LogOut, Building2, UserCircle, RefreshCw } from 'lucide-react';
import Link from 'next/link';

export function TopNav() {
  const { user, organization, logout } = useAuthStore();

  return (
    <header className="h-16 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-20 flex items-center justify-between px-8 ml-64">
      {/* Organization badge */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/60 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300">
          <Building2 className="w-3.5 h-3.5 text-brand-500" />
          <span>{organization?.name || 'Default Organization'}</span>
          <span className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px] font-semibold">
            {organization?.role || 'OWNER'}
          </span>
        </div>
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-4">
        {/* Quick Sync shortcut */}
        <Link
          href="/sync-jobs"
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Sync Status</span>
        </Link>

        {/* Notification Bell */}
        <Link
          href="/notifications"
          className="relative p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
        >
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500"></span>
        </Link>

        {/* User profile & Logout */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-brand-500">
              {user?.firstName ? user.firstName[0].toUpperCase() : 'U'}
            </div>
            <div className="hidden md:block">
              <span className="text-xs font-semibold text-slate-200 block">
                {user ? `${user.firstName} ${user.lastName}` : 'Merchant Admin'}
              </span>
              <span className="text-[10px] text-slate-400 block">{user?.email || 'admin@merchant.com'}</span>
            </div>
          </div>

          <button
            onClick={logout}
            title="Log out"
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
