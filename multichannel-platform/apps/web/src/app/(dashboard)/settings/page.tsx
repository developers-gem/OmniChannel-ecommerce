'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Settings as SettingsIcon, Save, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [successMsg, setSuccessMsg] = useState(false);

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
      setFormData({
        name: orgData.name || '',
        defaultCurrency: orgData.defaultCurrency || 'USD',
        timezone: orgData.timezone || 'UTC',
        settings: {
          safetyStockDefault: orgData.settings?.safetyStockDefault ?? 2,
          preventOversell: orgData.settings?.preventOversell ?? true,
          autoSyncInventory: orgData.settings?.autoSyncInventory ?? true,
          autoSyncPrices: orgData.settings?.autoSyncPrices ?? true,
        },
      });
    }
  }, [orgData]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.put('/settings', formData);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-settings'] });
      setSuccessMsg(true);
      setTimeout(() => setSuccessMsg(false), 3000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Platform Settings</h1>
        <p className="text-xs text-slate-400 mt-1">
          Tenant organization attributes, inventory safety stock policies, and sync rules
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800 flex items-center gap-2 text-emerald-300 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Organization settings saved successfully.</span>
        </div>
      )}

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
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">
                Default Currency
              </label>
              <select
                value={formData.defaultCurrency}
                onChange={(e) => setFormData({ ...formData, defaultCurrency: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Timezone</label>
              <select
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
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
                className="w-20 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none text-right"
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
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{updateMutation.isPending ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
