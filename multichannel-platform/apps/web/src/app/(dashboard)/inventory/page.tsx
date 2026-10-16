'use client';

import React, { useState, useMemo } from 'react';
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
  RefreshCw,
  Edit3,
  Globe,
  DollarSign,
  Truck,
  Tag,
  ExternalLink,
  Check,
  X,
  ShieldAlert,
  Sparkles,
  ShoppingBag,
  ArrowRight,
  Layers,
  HelpCircle,
  AlertCircle,
} from 'lucide-react';

interface ChannelDetail {
  connectionId: string;
  name: string;
  channelType: string;
  isMapped: boolean;
  syncStatus: string;
  channelPrice: number | null;
  channelStock: number | null;
  externalProductId: string | null;
  externalVariantId: string | null;
  lastSyncedAt: string | null;
}

interface InventoryRecord {
  _id: string;
  sku: string;
  variantTitle: string;
  productTitle: string;
  brand: string;
  category: string;
  trackedStock: number;
  reservedStock: number;
  safetyStock: number;
  availableToAllocate: number;
  lowStockThreshold: number;
  retailPrice: number;
  costPrice: number;
  shippingCharge: number;
  status: string;
  healthStatus: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';
  isLowStock: boolean;
  isOutOfStock: boolean;
  isDataChanged: boolean;
  isNeverSynced: boolean;
  canonicalVariantId: any;
  channels: ChannelDetail[];
  mappings: any[];
  allocations: any[];
  updatedAt: string;
  lastSyncedAt?: string;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();

  // Navigation tab: Stock Levels vs Audit Ledger
  const [activeTab, setActiveTab] = useState<'levels' | 'movements'>('levels');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [healthFilter, setHealthFilter] = useState<'ALL' | 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK'>('ALL');
  const [syncFilter, setSyncFilter] = useState<'ALL' | 'DATA_CHANGED' | 'IN_SYNC'>('ALL');

  // Adjust / Edit modal state
  const [adjustItem, setAdjustItem] = useState<InventoryRecord | null>(null);
  const [adjustForm, setAdjustForm] = useState<{
    trackedStock: number;
    safetyStock: number;
    retailPrice: number;
    costPrice: number;
    shippingCharge: number;
    status: string;
    reason: string;
  }>({
    trackedStock: 0,
    safetyStock: 0,
    retailPrice: 0,
    costPrice: 0,
    shippingCharge: 0,
    status: 'ACTIVE',
    reason: 'Inventory & details update',
  });

  // Channel Sync / "Data Changed Sync Again" modal state
  const [syncItem, setSyncItem] = useState<InventoryRecord | null>(null);
  const [channelSyncSelections, setChannelSyncSelections] = useState<
    Record<
      string,
      {
        enabled: boolean;
        channelType: string;
        price: number;
        ebayMarkupPercent?: number;
      }
    >
  >({});
  const [syncSuccessBanner, setSyncSuccessBanner] = useState<string | null>(null);

  // Fetch Inventory items
  const { data: inventoryData, isLoading: inventoryLoading } = useQuery({
    queryKey: ['inventory-items'],
    queryFn: async () => {
      const res: any = await api.get('/inventory?limit=100');
      return res.data || [];
    },
  });

  // Fetch Movements for Ledger tab
  const { data: movementsData, isLoading: movementsLoading } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: async () => {
      const res: any = await api.get('/inventory/movements');
      return res.data;
    },
    enabled: activeTab === 'movements',
  });

  // Mutation for Adjust / Edit details
  const adjustMutation = useMutation({
    mutationFn: async ({ variantId, payload }: { variantId: string; payload: any }) => {
      const res: any = await api.post(`/inventory/${variantId}/adjust`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      setAdjustItem(null);
    },
  });

  // Mutation for Syncing to Channels
  const syncChannelsMutation = useMutation({
    mutationFn: async ({ variantId, channels }: { variantId: string; channels: any[] }) => {
      const res: any = await api.post(`/inventory/${variantId}/sync-channels`, { channels });
      return res.data || res;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setSyncSuccessBanner('Channels successfully synchronized with latest inventory & pricing data!');
      setSyncItem(null);
      setTimeout(() => setSyncSuccessBanner(null), 6000);
    },
  });

  // Filter items based on user criteria
  const filteredItems: InventoryRecord[] = useMemo(() => {
    if (!inventoryData || !Array.isArray(inventoryData)) return [];

    return inventoryData.filter((item: InventoryRecord) => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSku = item.sku?.toLowerCase().includes(q);
        const matchesVariant = item.variantTitle?.toLowerCase().includes(q);
        const matchesProduct = item.productTitle?.toLowerCase().includes(q);
        if (!matchesSku && !matchesVariant && !matchesProduct) return false;
      }

      // Health status filter
      if (healthFilter !== 'ALL') {
        if (item.healthStatus !== healthFilter) return false;
      }

      // Sync status filter
      if (syncFilter === 'DATA_CHANGED') {
        if (!item.isDataChanged) return false;
      } else if (syncFilter === 'IN_SYNC') {
        if (item.isDataChanged) return false;
      }

      return true;
    });
  }, [inventoryData, searchQuery, healthFilter, syncFilter]);

  // Metric counts
  const metrics = useMemo(() => {
    if (!inventoryData || !Array.isArray(inventoryData)) {
      return { total: 0, inStock: 0, lowStock: 0, outOfStock: 0, dataChanged: 0 };
    }
    return {
      total: inventoryData.length,
      inStock: inventoryData.filter((i: InventoryRecord) => i.healthStatus === 'IN_STOCK').length,
      lowStock: inventoryData.filter((i: InventoryRecord) => i.healthStatus === 'LOW_STOCK').length,
      outOfStock: inventoryData.filter((i: InventoryRecord) => i.healthStatus === 'OUT_OF_STOCK').length,
      dataChanged: inventoryData.filter((i: InventoryRecord) => i.isDataChanged).length,
    };
  }, [inventoryData]);

  // Open Adjust / Edit Modal
  const handleOpenAdjust = (item: InventoryRecord) => {
    setAdjustItem(item);
    setAdjustForm({
      trackedStock: item.trackedStock ?? 0,
      safetyStock: item.safetyStock ?? 0,
      retailPrice: item.retailPrice ?? 0,
      costPrice: item.costPrice ?? 0,
      shippingCharge: item.shippingCharge ?? 0,
      status: item.status || 'ACTIVE',
      reason: 'Manual inventory & details update',
    });
  };

  // Submit Adjust / Edit Form
  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustItem) return;

    adjustMutation.mutate({
      variantId: adjustItem.canonicalVariantId?._id || adjustItem.canonicalVariantId,
      payload: {
        trackedStock: Number(adjustForm.trackedStock),
        safetyStock: Number(adjustForm.safetyStock),
        retailPrice: Number(adjustForm.retailPrice),
        costPrice: Number(adjustForm.costPrice),
        shippingCharge: Number(adjustForm.shippingCharge),
        status: adjustForm.status,
        reason: adjustForm.reason,
      },
    });
  };

  // Open Channel Sync / "Data Changed Sync Again" Modal
  const handleOpenSync = (item: InventoryRecord) => {
    setSyncItem(item);

    // Initialize selections for connected channels
    const initialSelections: Record<string, any> = {};
    const basePrice = item.retailPrice || 0;

    (item.channels || []).forEach((ch) => {
      const isEbay = ch.channelType === 'EBAY';
      // For eBay, suggest a default 10% fee markup to protect margins if not already set higher
      const defaultEbayPrice = isEbay
        ? parseFloat((basePrice * 1.1).toFixed(2))
        : basePrice;

      initialSelections[ch.connectionId] = {
        enabled: true,
        channelType: ch.channelType,
        price: ch.channelPrice ?? defaultEbayPrice,
        ebayMarkupPercent: isEbay ? 10 : 0,
      };
    });

    setChannelSyncSelections(initialSelections);
  };

  // Handle eBay Price quick markup selection
  const handleEbayQuickMarkup = (connectionId: string, percent: number) => {
    if (!syncItem) return;
    const base = syncItem.retailPrice || 0;
    const newPrice = parseFloat((base * (1 + percent / 100)).toFixed(2));

    setChannelSyncSelections((prev) => ({
      ...prev,
      [connectionId]: {
        ...prev[connectionId],
        price: newPrice,
        ebayMarkupPercent: percent,
      },
    }));
  };

  // Submit Sync to Channels
  const handleConfirmSync = () => {
    if (!syncItem) return;

    const channelsToSync = Object.entries(channelSyncSelections)
      .filter(([_, conf]) => conf.enabled)
      .map(([connId, conf]) => ({
        channelConnectionId: connId,
        channelType: conf.channelType,
        price: Number(conf.price),
        ebayMarkupPercent: conf.ebayMarkupPercent,
      }));

    if (channelsToSync.length === 0) {
      alert('Please select at least one channel to synchronize.');
      return;
    }

    syncChannelsMutation.mutate({
      variantId: syncItem.canonicalVariantId?._id || syncItem.canonicalVariantId,
      channels: channelsToSync,
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <Boxes className="w-6 h-6 text-brand-400" />
            <span>Inventory & Channel Sync</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time multi-channel stock ledger, pricing modifiers, health status, and live channel synchronization
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('levels')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'levels'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <Boxes className="w-3.5 h-3.5" />
            <span>Live Inventory Matrix</span>
          </button>

          <button
            onClick={() => setActiveTab('movements')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'movements'
                ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Ledger</span>
          </button>
        </div>
      </div>

      {/* Sync Success Alert Notification */}
      {syncSuccessBanner && (
        <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-800 flex items-center justify-between text-xs text-emerald-200 shadow-xl animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{syncSuccessBanner}</span>
          </div>
          <button
            onClick={() => setSyncSuccessBanner(null)}
            className="text-emerald-400 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-slate-400 uppercase font-semibold tracking-wider block">
            Total Tracked SKUs
          </span>
          <div className="text-xl font-bold text-white mt-1 font-mono">{metrics.total}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-emerald-400 uppercase font-semibold tracking-wider block flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            In Stock
          </span>
          <div className="text-xl font-bold text-emerald-400 mt-1 font-mono">{metrics.inStock}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-amber-400 uppercase font-semibold tracking-wider block flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            Low Stock
          </span>
          <div className="text-xl font-bold text-amber-400 mt-1 font-mono">{metrics.lowStock}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
          <span className="text-[10px] text-red-400 uppercase font-semibold tracking-wider block flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
            Out of Stock
          </span>
          <div className="text-xl font-bold text-red-400 mt-1 font-mono">{metrics.outOfStock}</div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg col-span-2 sm:col-span-1">
          <span className="text-[10px] text-amber-300 uppercase font-semibold tracking-wider block flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            Data Changed
          </span>
          <div className="text-xl font-bold text-amber-300 mt-1 font-mono">
            {metrics.dataChanged}
            <span className="text-[10px] font-normal text-slate-400 ml-1">need sync</span>
          </div>
        </div>
      </div>

      {/* Main Stock Levels View */}
      {activeTab === 'levels' && (
        <div className="space-y-4">
          {/* Search & Filters Bar */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search inventory by SKU, product title, or variant..."
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Health Filter */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                {(['ALL', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setHealthFilter(filter)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition cursor-pointer text-[11px] ${
                      healthFilter === filter
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {filter === 'ALL'
                      ? 'All Health'
                      : filter === 'IN_STOCK'
                      ? 'In Stock'
                      : filter === 'LOW_STOCK'
                      ? 'Low Stock'
                      : 'Out of Stock'}
                  </button>
                ))}
              </div>

              {/* Sync Status Filter */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                <button
                  onClick={() => setSyncFilter(syncFilter === 'DATA_CHANGED' ? 'ALL' : 'DATA_CHANGED')}
                  className={`px-3 py-1 rounded-lg font-semibold transition cursor-pointer text-[11px] flex items-center gap-1.5 ${
                    syncFilter === 'DATA_CHANGED'
                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/80'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="Filter items that have modified stock, price, or details and need re-syncing to channels"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Data Changed Only</span>
                </button>
              </div>
            </div>
          </div>

          {/* Table Containing All Requested Inventory Fields */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-800/70 text-slate-300 uppercase text-[10px] font-bold border-b border-slate-800 tracking-wider">
                  <tr>
                    <th className="py-3 px-3.5">SKU</th>
                    <th className="py-3 px-3.5">VARIANT</th>
                    <th className="py-3 px-3.5 text-center">STOCK</th>
                    <th className="py-3 px-3.5 text-right">PRICE</th>
                    <th className="py-3 px-3.5 text-center">HEALTH STATUS</th>
                    <th className="py-3 px-3.5 text-center">SHIPPING CHARGES</th>
                    <th className="py-3 px-3.5 text-center">STATUS</th>
                    <th className="py-3 px-3.5 text-center">SYNC (CHANNELS)</th>
                    <th className="py-3 px-3.5 text-center">ADJUSTMENT</th>
                    <th className="py-3 px-3.5 text-center">INFO UPDATED / SYNC STATUS</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/70 font-sans">
                  {inventoryLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500 font-mono">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-brand-400" />
                        <span>Loading inventory matrix...</span>
                      </td>
                    </tr>
                  ) : filteredItems.length > 0 ? (
                    filteredItems.map((item) => {
                      return (
                        <tr
                          key={item._id}
                          className={`hover:bg-slate-800/40 transition ${
                            item.isDataChanged ? 'bg-amber-950/10' : ''
                          }`}
                        >
                          {/* 1. SKU */}
                          <td className="py-3.5 px-3.5">
                            <span className="font-mono font-bold text-white text-xs block">
                              {item.sku}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {item.brand}
                            </span>
                          </td>

                          {/* 2. VARIANT */}
                          <td className="py-3.5 px-3.5 max-w-[180px]">
                            <div className="font-semibold text-slate-200 truncate" title={item.variantTitle}>
                              {item.variantTitle}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate" title={item.productTitle}>
                              {item.productTitle}
                            </div>
                          </td>

                          {/* 3. STOCK (Tracked, Safety Buffer, Available) */}
                          <td className="py-3.5 px-3.5 text-center">
                            <div className="inline-flex flex-col items-center">
                              <span className="font-mono font-bold text-white text-sm">
                                {item.trackedStock}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Avail: <strong className="text-emerald-400">{item.availableToAllocate}</strong>
                                {item.safetyStock > 0 && ` | Safe: ${item.safetyStock}`}
                              </span>
                            </div>
                          </td>

                          {/* 4. PRICE (Retail & Cost) */}
                          <td className="py-3.5 px-3.5 text-right font-mono">
                            <div className="font-bold text-white text-xs">
                              ${Number(item.retailPrice).toFixed(2)}
                            </div>
                            {item.costPrice > 0 && (
                              <div className="text-[10px] text-slate-500">
                                Cost: ${Number(item.costPrice).toFixed(2)}
                              </div>
                            )}
                          </td>

                          {/* 5. HEALTH STATUS */}
                          <td className="py-3.5 px-3.5 text-center">
                            {item.healthStatus === 'IN_STOCK' ? (
                              <span className="inline-flex items-center gap-1 bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                In Stock
                              </span>
                            ) : item.healthStatus === 'LOW_STOCK' ? (
                              <span className="inline-flex items-center gap-1 bg-amber-950 text-amber-400 border border-amber-800/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                                Low Stock
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-red-950 text-red-400 border border-red-800/60 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                Out of Stock
                              </span>
                            )}
                          </td>

                          {/* 6. SHIPPING CHARGES */}
                          <td className="py-3.5 px-3.5 text-center font-mono">
                            {item.shippingCharge > 0 ? (
                              <span className="text-xs font-semibold text-slate-200">
                                ${Number(item.shippingCharge).toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-800/50">
                                Free Ship
                              </span>
                            )}
                          </td>

                          {/* 7. STATUS */}
                          <td className="py-3.5 px-3.5 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                item.status === 'ACTIVE'
                                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                  : item.status === 'DRAFT'
                                  ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                  : 'bg-red-950 text-red-400 border border-red-800/60'
                              }`}
                            >
                              {item.status || 'ACTIVE'}
                            </span>
                          </td>

                          {/* 8. SYNC (Button in each row showing mapped channels) */}
                          <td className="py-3.5 px-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenSync(item)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                              title="Inspect channel synchronization & mappings"
                            >
                              <Globe className="w-3.5 h-3.5 text-brand-400" />
                              <span>Channels</span>
                              {item.channels && item.channels.filter((c) => c.isMapped).length > 0 && (
                                <span className="bg-brand-500/20 text-brand-300 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold">
                                  {item.channels.filter((c) => c.isMapped).length}
                                </span>
                              )}
                            </button>
                          </td>

                          {/* 9. ADJUSTMENT (Edit button showing all fields to edit) */}
                          <td className="py-3.5 px-3.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleOpenAdjust(item)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer"
                              title="Edit stock, price, shipping charges, status, and log movement"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-brand-400" />
                              <span>Adjust</span>
                            </button>
                          </td>

                          {/* 10. INFO UPDATED OR NOT & DATA CHANGED SYNC AGAIN BUTTON */}
                          <td className="py-3.5 px-3.5 text-center">
                            {item.isDataChanged ? (
                              <button
                                type="button"
                                onClick={() => handleOpenSync(item)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold shadow-md shadow-amber-600/30 transition cursor-pointer animate-in fade-in"
                                title="Data of this row has been updated! Click to sync again with connected channels"
                              >
                                <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                                <span>Data Changed &ndash; Sync Again</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-xl">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>In Sync</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        No inventory records matched your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Audit Movements Ledger View */}
      {activeTab === 'movements' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">
              Immutable Stock Movement History
            </h2>
            <span className="text-xs text-slate-400 font-mono">Real-time ledger audit log</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Change Type</th>
                  <th className="py-3 px-4 text-center">Delta</th>
                  <th className="py-3 px-4 text-center">Before &rarr; After</th>
                  <th className="py-3 px-4">Reason / Reference</th>
                  <th className="py-3 px-4 text-right">Operator</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 font-sans">
                {movementsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                      Loading audit movements...
                    </td>
                  </tr>
                ) : movementsData && movementsData.length > 0 ? (
                  movementsData.map((m: any) => (
                    <tr key={m._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                        {new Date(m.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-white">
                        {m.canonicalVariantId?.sku || 'SKU'}
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                          {m.changeType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold">
                        <span className={m.quantityChanged >= 0 ? 'text-emerald-400' : 'text-red-400'}>
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
                    <td colSpan={7} className="py-12 text-center text-slate-500 font-mono">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADJUST / EDIT MODAL (Shows ALL fields for editing) */}
      {adjustItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-brand-400" />
                  <span>Adjust Inventory & Product Details</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">
                  SKU: <strong className="text-brand-300">{adjustItem.sku}</strong> ({adjustItem.variantTitle})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="space-y-4">
              {/* Stock Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Physical Tracked Stock *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={adjustForm.trackedStock}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, trackedStock: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Safety Buffer Stock
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={adjustForm.safetyStock}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, safetyStock: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Price Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Retail Price ($) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    required
                    value={adjustForm.retailPrice}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, retailPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Cost Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={adjustForm.costPrice}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, costPrice: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Shipping Charges & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Shipping Charges ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={adjustForm.shippingCharge}
                    onChange={(e) =>
                      setAdjustForm({ ...adjustForm, shippingCharge: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="0.00 for Free Shipping"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white font-mono text-xs focus:border-brand-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                    Catalog Status
                  </label>
                  <select
                    value={adjustForm.status}
                    onChange={(e) => setAdjustForm({ ...adjustForm, status: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="DRAFT">DRAFT</option>
                    <option value="ARCHIVED">ARCHIVED</option>
                  </select>
                </div>
              </div>

              {/* Reason for Audit */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1">
                  Reason for Adjustment *
                </label>
                <input
                  type="text"
                  required
                  value={adjustForm.reason}
                  onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                  placeholder="e.g. Physical cycle count, Supplier restock, Price revision"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-white text-xs focus:border-brand-500 focus:outline-none"
                />
              </div>

              {/* Notice that saving triggers Data Changed status */}
              <div className="p-3 rounded-xl bg-brand-500/10 border border-brand-500/20 text-xs text-brand-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-400 shrink-0" />
                <span>
                  Updating these fields will update your master catalog and flag this SKU as &ldquo;Data Changed&rdquo; so you can push updates to all your sales channels.
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setAdjustItem(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adjustMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl transition shadow-lg shadow-brand-600/30 flex items-center gap-2 cursor-pointer"
                >
                  {adjustMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Changes & Log Movement</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CHANNEL SYNC / "DATA CHANGED - SYNC AGAIN" MODAL */}
      {syncItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 border border-brand-500/40 flex items-center justify-center text-brand-400 shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Channel Synchronization</h3>
                  <p className="text-xs text-slate-400 mt-0.5 font-mono">
                    SKU: <strong className="text-white">{syncItem.sku}</strong> &bull; {syncItem.variantTitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Master Catalog Values */}
            <div className="grid grid-cols-3 gap-3 bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Available Stock</span>
                <span className="text-sm font-bold text-emerald-400">{syncItem.availableToAllocate} units</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Master Retail Price</span>
                <span className="text-sm font-bold text-white">${Number(syncItem.retailPrice).toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase block">Shipping Charges</span>
                <span className="text-sm font-bold text-slate-300">
                  {syncItem.shippingCharge > 0 ? `$${Number(syncItem.shippingCharge).toFixed(2)}` : 'Free'}
                </span>
              </div>
            </div>

            {/* Channels List with Custom Pricing (Special eBay Fee Markup) */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Select Channels to Synchronize</span>
                <span className="text-[11px] text-slate-500 normal-case font-normal">
                  Customize prices per channel to optimize profit margins
                </span>
              </h4>

              {syncItem.channels && syncItem.channels.length > 0 ? (
                <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                  {syncItem.channels.map((ch) => {
                    const isEbay = ch.channelType === 'EBAY';
                    const config = channelSyncSelections[ch.connectionId] || {
                      enabled: true,
                      channelType: ch.channelType,
                      price: ch.channelPrice ?? syncItem.retailPrice,
                    };

                    return (
                      <div
                        key={ch.connectionId}
                        className={`p-4 rounded-xl border transition ${
                          config.enabled
                            ? isEbay
                              ? 'bg-amber-950/20 border-amber-800/70'
                              : 'bg-slate-950 border-slate-800'
                            : 'bg-slate-950/40 border-slate-900 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={config.enabled}
                              onChange={(e) =>
                                setChannelSyncSelections((prev) => ({
                                  ...prev,
                                  [ch.connectionId]: {
                                    ...prev[ch.connectionId],
                                    enabled: e.target.checked,
                                  },
                                }))
                              }
                              className="w-4 h-4 rounded text-brand-600 focus:ring-brand-500 bg-slate-900 border-slate-700"
                            />
                            <div>
                              <div className="font-semibold text-white text-xs flex items-center gap-2">
                                <span>{ch.name}</span>
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                                  {ch.channelType}
                                </span>
                                {ch.isMapped ? (
                                  <span className="text-[10px] text-emerald-400 font-medium">
                                    &bull; Mapped
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-brand-400 font-medium">
                                    &bull; Ready to Push
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-400 font-mono">
                                {ch.lastSyncedAt
                                  ? `Last synced: ${new Date(ch.lastSyncedAt).toLocaleString()}`
                                  : 'Not yet synced to this channel'}
                              </span>
                            </div>
                          </label>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-400">Sync Price:</span>
                            <div className="relative w-28">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-xs">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min={0}
                                disabled={!config.enabled}
                                value={config.price}
                                onChange={(e) =>
                                  setChannelSyncSelections((prev) => ({
                                    ...prev,
                                    [ch.connectionId]: {
                                      ...prev[ch.connectionId],
                                      price: parseFloat(e.target.value) || 0,
                                    },
                                  }))
                                }
                                className="w-full pl-6 pr-2 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs text-right focus:border-brand-500 focus:outline-none disabled:opacity-50"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Special eBay Price / Fee Offset Section */}
                        {isEbay && config.enabled && (
                          <div className="mt-3 pt-3 border-t border-amber-900/40 text-xs">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-amber-300">
                                <DollarSign className="w-3.5 h-3.5 text-amber-400" />
                                <span className="font-semibold text-[11px]">
                                  eBay Marketplace Fee Adjustment:
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400">Quick Fee Offset:</span>
                                <button
                                  type="button"
                                  onClick={() => handleEbayQuickMarkup(ch.connectionId, 10)}
                                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer"
                                >
                                  +10%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEbayQuickMarkup(ch.connectionId, 15)}
                                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer"
                                >
                                  +15%
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEbayQuickMarkup(ch.connectionId, 0)}
                                  className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer"
                                >
                                  Match Master
                                </button>
                              </div>
                            </div>
                            <p className="text-[10px] text-amber-200/80 mt-1 leading-relaxed">
                              💡 eBay charges higher seller transaction fees (~13% - 15%). We recommend keeping the eBay price slightly higher to protect your profit margin.
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-400">
                  <p>No active sales channels connected yet.</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Connect Shopify or eBay under Channel Integrations to enable automated pushing.
                  </p>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <span className="text-[11px] text-slate-400 font-mono">
                Syncs available stock ({syncItem.availableToAllocate}) & selected prices
              </span>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSyncItem(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmSync}
                  disabled={syncChannelsMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl transition shadow-lg shadow-brand-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {syncChannelsMutation.isPending ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Syncing to Channels...</span>
                    </>
                  ) : (
                    <>
                      <Globe className="w-3.5 h-3.5" />
                      <span>Sync Now to Selected Channels</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
