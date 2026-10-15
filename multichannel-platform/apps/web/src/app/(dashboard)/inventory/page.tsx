'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Boxes,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  History,
  ArrowUpDown,
  Search,
  Filter,
} from 'lucide-react';

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'levels' | 'movements'>('levels');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);
  const [adjustStock, setAdjustStock] = useState<number>(0);
  const [safetyStock, setSafetyStock] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('Cycle count reconciliation');

  // Fetch Inventory items
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-items', lowStockFilter],
    queryFn: async () => {
      const res: any = await api.get(`/inventory?lowStock=${lowStockFilter}`);
      return res.data;
    },
  });

  // Fetch Movements
  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: async () => {
      const res: any = await api.get('/inventory/movements');
      return res.data;
    },
    enabled: activeTab === 'movements',
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ variantId, payload }: any) => {
      const res: any = await api.post(`/inventory/${variantId}/adjust`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setSelectedItem(null);
    },
  });

  const handleOpenAdjust = (item: any) => {
    setSelectedItem(item);
    setAdjustStock(item.trackedStock);
    setSafetyStock(item.safetyStock);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;
    adjustMutation.mutate({
      variantId: selectedItem.canonicalVariantId._id,
      payload: {
        trackedStock: Number(adjustStock),
        safetyStock: Number(safetyStock),
        reason: adjustReason,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Inventory Management</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time stock ledger, safety stock buffers, and channel oversell protection
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('levels')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'levels'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Stock Levels</span>
          </button>
          <button
            onClick={() => setActiveTab('movements')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'movements'
                ? 'bg-slate-800 text-white border border-slate-700'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Ledger</span>
          </button>
        </div>
      </div>

      {activeTab === 'levels' && (
        <div className="space-y-4">
          {/* Quick Filter */}
          <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <button
              onClick={() => setLowStockFilter(!lowStockFilter)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                lowStockFilter
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800'
                  : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-white'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Low Stock Threshold Only</span>
            </button>
          </div>

          {/* Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">SKU</th>
                    <th className="py-3 px-4">Product Variant</th>
                    <th className="py-3 px-4 text-center">Tracked Physical</th>
                    <th className="py-3 px-4 text-center">Reserved</th>
                    <th className="py-3 px-4 text-center">Safety Buffer</th>
                    <th className="py-3 px-4 text-center">Available to Allocate</th>
                    <th className="py-3 px-4 text-center">Health Status</th>
                    <th className="py-3 px-4 text-right">Adjustment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {inventoryLoading ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        Loading inventory ledger...
                      </td>
                    </tr>
                  ) : inventoryData && inventoryData.length > 0 ? (
                    inventoryData.map((item: any) => (
                      <tr key={item._id} className="hover:bg-slate-800/40 transition">
                        <td className="py-3.5 px-4 font-mono font-bold text-brand-400">
                          {item.sku}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-200">
                            {item.canonicalVariantId?.title}
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {item.canonicalVariantId?.canonicalProductId?.title}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                          {item.trackedStock}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                          {item.reservedStock}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-slate-400">
                          {item.safetyStock}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono font-extrabold text-emerald-400 text-sm">
                          {item.availableToAllocate}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {item.isLowStock ? (
                            <span className="bg-amber-950 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                              Low Stock
                            </span>
                          ) : (
                            <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                              In Stock
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => handleOpenAdjust(item)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs px-2.5 py-1.5 rounded-lg border border-slate-700 transition"
                          >
                            Adjust
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No inventory items found. Create a product or import via CSV.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Audit Movement Ledger */}
      {activeTab === 'movements' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Variant SKU</th>
                  <th className="py-3 px-4">Change Type</th>
                  <th className="py-3 px-4 text-center">Quantity Delta</th>
                  <th className="py-3 px-4 text-center">Stock Before &rarr; After</th>
                  <th className="py-3 px-4">Reason / Reference</th>
                  <th className="py-3 px-4 text-right">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {movementsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      Loading audit movements...
                    </td>
                  </tr>
                ) : movementsData && movementsData.length > 0 ? (
                  movementsData.map((m: any) => (
                    <tr key={m._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-200">
                        {m.canonicalVariantId?.sku || 'SKU'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {m.changeType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        <span
                          className={m.quantityChanged >= 0 ? 'text-emerald-400' : 'text-red-400'}
                        >
                          {m.quantityChanged >= 0 ? `+${m.quantityChanged}` : m.quantityChanged}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono text-slate-300">
                        {m.previousTrackedStock} &rarr; {m.newTrackedStock}
                      </td>
                      <td className="py-3.5 px-4 text-slate-300">{m.reason}</td>
                      <td className="py-3.5 px-4 text-right text-slate-400">
                        {m.performedBy?.firstName || 'System'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Adjust Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h2 className="text-base font-bold text-white">Adjust Stock Level</h2>
            <p className="text-xs text-slate-400 mt-0.5 mb-4 font-mono">
              SKU: {selectedItem.sku} ({selectedItem.canonicalVariantId?.title})
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Physical Tracked Stock
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={adjustStock}
                  onChange={(e) => setAdjustStock(parseInt(e.target.value, 10))}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Safety Stock Buffer
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  value={safetyStock}
                  onChange={(e) => setSafetyStock(parseInt(e.target.value, 10))}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Supplier restock, physical cycle count"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-brand-600/30"
                >
                  {adjustMutation.isPending ? 'Saving...' : 'Update & Log Movement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
