'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { useThemeStore, THEMES } from '@/lib/theme';
import { Bell, LogOut, Building2, UserCircle, RefreshCw, Palette, Check, Settings } from 'lucide-react';
import Link from 'next/link';

export function TopNav() {
  const { user, organization, logout } = useAuthStore();
  const { theme: currentTheme, setTheme } = useThemeStore();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setIsThemeMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      <div className="flex items-center gap-3">
        {/* Quick Sync shortcut */}
        <Link
          href="/sync-jobs"
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition"
        >
          <RefreshCw className="w-3.5 h-3.5 text-brand-400" />
          <span>Sync Status</span>
        </Link>

        {/* Quick Theme Switcher */}
        <div className="relative" ref={themeMenuRef}>
          <button
            type="button"
            onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
            title="Change Visual Theme"
            className={`p-2 rounded-lg border transition flex items-center gap-1.5 cursor-pointer ${
              isThemeMenuOpen
                ? 'bg-slate-800 text-brand-400 border-brand-500/40'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800 border-transparent hover:border-slate-700'
            }`}
          >
            <Palette className="w-4 h-4 text-brand-400" />
          </button>

          {isThemeMenuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-scale-up space-y-1">
              <div className="px-3 py-2 border-b border-slate-800/80">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Select Theme
                </span>
                <span className="text-xs text-slate-300 font-semibold block mt-0.5">
                  Visual Dashboard Palette
                </span>
              </div>

              <div className="space-y-1 py-1">
                {THEMES.map((t) => {
                  const isActive = currentTheme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTheme(t.id);
                        setIsThemeMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition cursor-pointer text-left ${
                        isActive
                          ? 'bg-brand-950/60 text-brand-300 font-semibold border border-brand-800/60'
                          : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0 shadow-sm"
                          style={{ backgroundColor: t.accentHex }}
                        ></span>
                        <div>
                          <div className="font-semibold text-xs text-white">{t.name}</div>
                          <div className="text-[10px] text-slate-400">{t.badge}</div>
                        </div>
                      </div>

                      {isActive && <Check className="w-4 h-4 text-brand-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-slate-800/80 px-2 pb-1">
                <Link
                  href="/settings"
                  onClick={() => setIsThemeMenuOpen(false)}
                  className="flex items-center justify-between text-[11px] text-slate-400 hover:text-brand-300 py-1 font-medium transition"
                >
                  <span>More Theme Settings</span>
                  <Settings className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          )}
        </div>

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
            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition ml-1 cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
