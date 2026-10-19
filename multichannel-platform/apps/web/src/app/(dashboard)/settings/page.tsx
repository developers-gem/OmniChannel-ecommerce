'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useThemeStore, THEMES, ThemeId } from '@/lib/theme';
import { useCurrency, SUPPORTED_CURRENCIES, getCurrencyInfo } from '@/lib/currency';
import {
  Settings as SettingsIcon,
  Save,
  ShieldAlert,
  CheckCircle2,
  Palette,
  Sparkles,
  Check,
  Layers,
  Sliders,
  Coins,
} from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState(false);
  const [themeMsg, setThemeMsg] = useState<string | null>(null);

  const { theme: currentTheme, setTheme } = useThemeStore();
  const { currency: activeCurrency, setCurrency, format } = useCurrency();

  const { data: orgData, isLoading } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => {
      const res: any = await api.get('/settings');
      return res.data;
    },
  });

  const [formData, setFormData] = useState({
    name: '',
    defaultCurrency: 'USD',
    timezone: 'UTC',
    settings: {
      safetyStockDefault: 2,
      preventOversell: true,
      autoSyncInventory: true,
      autoSyncPrices: true,
    },
  });

  useEffect(() => {
    if (orgData) {
      const cur = orgData.defaultCurrency || 'USD';
      setCurrency(cur);
      setFormData({
        name: orgData.name || '',
        defaultCurrency: cur,
        timezone: orgData.timezone || 'UTC',
        settings: {
          safetyStockDefault: orgData.settings?.safetyStockDefault ?? 2,
          preventOversell: orgData.settings?.preventOversell ?? true,
          autoSyncInventory: orgData.settings?.autoSyncInventory ?? true,
          autoSyncPrices: orgData.settings?.autoSyncPrices ?? true,
        },
      });
    }
  }, [orgData, setCurrency]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.put('/settings', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      if (formData.defaultCurrency) {
        setCurrency(formData.defaultCurrency);
      }
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  const handleSelectTheme = (themeId: ThemeId, themeName: string) => {
    setTheme(themeId);
    setThemeMsg(`Visual theme changed to "${themeName}". Preferences saved.`);
    setTimeout(() => setThemeMsg(null), 3500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Customize platform appearance themes, tenant organization attributes, and inventory synchronization rules
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center gap-2 text-emerald-300 text-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Organization settings saved successfully.</span>
        </div>
      )}

      {themeMsg && (
        <div className="p-3.5 rounded-xl bg-brand-950/60 border border-brand-800 flex items-center gap-2 text-brand-300 text-xs animate-fade-in">
          <Sparkles className="w-4 h-4 text-brand-400" />
          <span>{themeMsg}</span>
        </div>
      )}

      {/* Visual Themes Customizer Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Palette className="w-4 h-4 text-brand-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                Platform Appearance & Visual Themes
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Select your preferred visual aesthetic. Changes adapt live across all dashboards, sidebars, navigation, and controls.
            </p>
          </div>

          <span className="text-[11px] font-mono text-brand-400 bg-brand-950/60 border border-brand-800/60 px-2.5 py-1 rounded-lg shrink-0">
            Current: {THEMES.find((t) => t.id === currentTheme)?.name || 'Emerald Obsidian'}
          </span>
        </div>

        {/* 4 Theme Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <div
                key={theme.id}
                onClick={() => handleSelectTheme(theme.id, theme.name)}
                className={`relative rounded-2xl p-4 border transition-all cursor-pointer select-none flex flex-col justify-between ${
                  isSelected
                    ? 'border-brand-500 bg-slate-800/80 shadow-lg shadow-brand-500/10 ring-2 ring-brand-500/30'
                    : 'border-slate-800 bg-slate-850/50 hover:bg-slate-800/50 hover:border-slate-700'
                }`}
              >
                <div>
                  {/* Top Bar with Badge & Selection Indicator */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-md shrink-0"
                        style={{ backgroundColor: theme.accentHex }}
                      ></span>
                      <span className="font-bold text-white text-sm">{theme.name}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border border-slate-700 bg-slate-800 text-slate-300">
                        {theme.badge}
                      </span>
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center border transition ${
                          isSelected
                            ? 'bg-brand-600 border-brand-500 text-white'
                            : 'bg-slate-800 border-slate-700 text-transparent'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                      </div>
                    </div>
                  </div>

                  {/* Visual Mock Canvas Preview */}
                  <div
                    className="w-full h-20 rounded-xl p-2.5 border mb-3 flex flex-col justify-between overflow-hidden relative"
                    style={{
                      backgroundColor: theme.previewColors.bg,
                      borderColor: theme.previewColors.border,
                    }}
                  >
                    {/* Mock Nav */}
                    <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-md"
                          style={{ backgroundColor: theme.previewColors.primary }}
                        ></span>
                        <span className="text-[10px] font-semibold text-white/90">OmniChannel</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-white/40"></span>
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: theme.previewColors.primary }}
                        ></span>
                      </div>
                    </div>

                    {/* Mock Cards Strip */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1">
                      <div
                        className="rounded-lg p-1.5 border"
                        style={{
                          backgroundColor: theme.previewColors.card,
                          borderColor: theme.previewColors.border,
                        }}
                      >
                        <div className="w-5 h-1 bg-white/20 rounded"></div>
                        <div
                          className="w-8 h-2 rounded mt-1"
                          style={{ backgroundColor: theme.previewColors.primary }}
                        ></div>
                      </div>
                      <div
                        className="rounded-lg p-1.5 border"
                        style={{
                          backgroundColor: theme.previewColors.card,
                          borderColor: theme.previewColors.border,
                        }}
                      >
                        <div className="w-6 h-1 bg-white/20 rounded"></div>
                        <div className="w-5 h-2 bg-white/40 rounded mt-1"></div>
                      </div>
                      <div
                        className="rounded-lg p-1.5 border"
                        style={{
                          backgroundColor: theme.previewColors.card,
                          borderColor: theme.previewColors.border,
                        }}
                      >
                        <div className="w-4 h-1 bg-white/20 rounded"></div>
                        <div className="w-7 h-2 bg-white/30 rounded mt-1"></div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                    {theme.description}
                  </p>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">
                    {theme.tagline}
                  </span>
                  <span
                    className={`font-semibold text-xs ${
                      isSelected ? 'text-brand-400' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {isSelected ? 'Active Theme' : 'Click to Apply'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Details */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Tenant Profile
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Organization Name
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Default Currency
              </label>
              <select
                value={formData.defaultCurrency}
                onChange={(e) => {
                  const newCode = e.target.value;
                  setFormData({ ...formData, defaultCurrency: newCode });
                  setCurrency(newCode);
                }}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.flag} {c.code} ({c.symbol}) — {c.name}
                  </option>
                ))}
              </select>
              <span className="text-[11px] text-slate-400 mt-1 block">
                Preview: <strong className="text-emerald-400">{format(129.99)}</strong> •{' '}
                <strong className="text-white">{format(2450)}</strong>
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
              >
                <option value="UTC">UTC (Coordinated Universal Time)</option>
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="Europe/London">Europe/London (GMT)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Inventory Rules */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Inventory & Synchronization Rules
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">Default Safety Stock</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Buffer quantity held back from all connected channels to prevent overselling
                </span>
              </div>
              <input
                type="number"
                min={0}
                value={formData.settings.safetyStockDefault}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    settings: {
                      ...formData.settings,
                      safetyStockDefault: parseInt(e.target.value, 10),
                    },
                  })
                }
                className="w-20 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none text-right focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">
                  Strict Oversell Protection
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Automatically clamp channel inventory allocations when stock dips below safe
                  thresholds
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.settings.preventOversell}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    settings: {
                      ...formData.settings,
                      preventOversell: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
              <div>
                <span className="text-xs font-bold text-white block">
                  Automated Background Inventory Propagation
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  Push atomic stock reductions to Shopify, eBay, and Custom stores immediately upon order placement
                </span>
              </div>
              <input
                type="checkbox"
                checked={formData.settings.autoSyncInventory}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    settings: {
                      ...formData.settings,
                      autoSyncInventory: e.target.checked,
                    },
                  })
                }
                className="w-4 h-4 accent-brand-500 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={updateMutation.isPending}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{updateMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
