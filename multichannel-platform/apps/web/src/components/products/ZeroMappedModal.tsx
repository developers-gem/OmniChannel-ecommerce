'use client';

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Unlink,
  CheckCircle2,
  AlertCircle,
  Share2,
  RefreshCw,
  Search,
  Check,
  UploadCloud,
  Layers,
  Sparkles,
  Store,
  Boxes,
  Tag,
  ArrowRight,
  Filter,
} from 'lucide-react';
import { useCurrency } from '@/lib/currency';

interface ZeroMappedModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessNotification: (message: string) => void;
  initialFilter?: 'all' | 'zero_only' | 'missing_ebay' | 'missing_shopify' | 'unmapped_only';
}

export function ZeroMappedModal({
  isOpen,
  onClose,
  onSuccessNotification,
  initialFilter = 'zero_only',
}: ZeroMappedModalProps) {
  const queryClient = useQueryClient();
  const { format } = useCurrency();

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<
    'all' | 'zero_only' | 'missing_ebay' | 'missing_shopify' | 'unmapped_only'
  >(initialFilter || 'zero_only');

  // Synchronize filter when modal opens
  useEffect(() => {
    if (isOpen) {
      setFilterType(initialFilter || 'zero_only');
    }
  }, [isOpen, initialFilter]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productChannelSelections, setProductChannelSelections] = useState<{
    [productId: string]: string[];
  }>({});
  const [publishingRowId, setPublishingRowId] = useState<string | null>(null);

  // Master channel picker modal state (for "Map All Unmapped Products")
  const [isMasterChannelModalOpen, setIsMasterChannelModalOpen] = useState(false);
  const [masterTargetChannelIds, setMasterTargetChannelIds] = useState<string[]>([]);

  // Fetch 0-mapped products
  const {
    data: zeroMappedData,
    isLoading,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['zero-mapped-products', searchTerm],
    queryFn: async () => {
      let url = '/products/zero-mapped';
      if (searchTerm) url += `?search=${encodeURIComponent(searchTerm)}`;
      const res: any = await api.get(url);
      return res;
    },
    enabled: isOpen,
  });

  const productsList: any[] = zeroMappedData?.data || [];
  const activeChannels: any[] = zeroMappedData?.activeChannels || [];

  // Filter products locally by filterType
  const filteredProducts = productsList.filter((p: any) => {
    if (filterType === 'zero_only') return p.isZeroMapped;
    if (filterType === 'missing_ebay')
      return (p.missingChannels || []).some((c: any) => c.channelType === 'EBAY');
    if (filterType === 'missing_shopify')
      return (p.missingChannels || []).some((c: any) => c.channelType === 'SHOPIFY');
    if (filterType === 'unmapped_only') return (p.unmappedFrom || []).length > 0;
    return true;
  });

  // Initialize channel selections when products or channels load
  useEffect(() => {
    if (productsList.length > 0 && activeChannels.length > 0) {
      setProductChannelSelections((prev) => {
        const next = { ...prev };
        productsList.forEach((prod: any) => {
          if (!next[prod._id]) {
            // By default, select all available channels that are not currently mapped
            const defaultChannels = (prod.availableChannels || [])
              .filter((c: any) => !c.isMapped)
              .map((c: any) => c.channelConnectionId);
            next[prod._id] = defaultChannels;
          }
        });
        return next;
      });

      // Default master channels to all active channels
      setMasterTargetChannelIds(activeChannels.map((c: any) => c.id));
    }
  }, [productsList, activeChannels]);

  // Bulk publish mutation
  const bulkPublishMutation = useMutation({
    mutationFn: async (payload: {
      items?: any[];
      productIds?: string[];
      channelConnectionIds?: string[];
      forceRepublish?: boolean;
    }) => {
      const res: any = await api.post('/products/bulk-publish', payload);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['zero-mapped-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings-count'] });
      refetch();
      onSuccessNotification(data?.message || 'Products successfully mapped and pushed to channels!');
      setIsMasterChannelModalOpen(false);
      setSelectedProductIds([]);
    },
    onError: (err: any) => {
      alert(`Error publishing products: ${err.message || 'Operation failed'}`);
    },
  });

  // Toggle selection for a single product
  const toggleSelectProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  // Toggle Select All
  const handleSelectAllToggle = () => {
    const allFilteredIds = filteredProducts.map((p) => p._id);
    const areAllSelected = allFilteredIds.every((id) => selectedProductIds.includes(id));
    if (areAllSelected) {
      setSelectedProductIds((prev) => prev.filter((id) => !allFilteredIds.includes(id)));
    } else {
      setSelectedProductIds((prev) => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  // Toggle a channel for a specific product row
  const toggleChannelForProduct = (productId: string, channelId: string) => {
    setProductChannelSelections((prev) => {
      const cur = prev[productId] || [];
      const updated = cur.includes(channelId)
        ? cur.filter((id) => id !== channelId)
        : [...cur, channelId];
      return { ...prev, [productId]: updated };
    });
  };

  // Push single product row to its selected channels
  const handlePushRow = async (prod: any) => {
    const selectedChannels = productChannelSelections[prod._id] || [];
    if (selectedChannels.length === 0) {
      alert('Please select at least one channel to map and push this product to.');
      return;
    }

    setPublishingRowId(prod._id);
    try {
      await bulkPublishMutation.mutateAsync({
        items: [{ productId: prod._id, channelConnectionIds: selectedChannels }],
        forceRepublish: true,
      });
    } finally {
      setPublishingRowId(null);
    }
  };

  // Push all manually selected products at once
  const handlePushManuallySelected = () => {
    if (selectedProductIds.length === 0) return;

    const items = selectedProductIds.map((id) => ({
      productId: id,
      channelConnectionIds: productChannelSelections[id] || [],
    }));

    const hasAnyChannels = items.some((item) => item.channelConnectionIds.length > 0);
    if (!hasAnyChannels) {
      alert('None of the selected products have channels selected. Please select target channels for the products.');
      return;
    }

    if (
      window.confirm(
        `Are you sure you want to map and push ${selectedProductIds.length} selected products to their chosen channels?`
      )
    ) {
      bulkPublishMutation.mutate({ items, forceRepublish: true });
    }
  };

  // Confirm and Map ALL 0-mapped products to master selected channels
  const handleConfirmMapAll = () => {
    if (masterTargetChannelIds.length === 0) {
      alert('Please select at least one channel to map all products to.');
      return;
    }

    const allProductIds = filteredProducts.map((p) => p._id);
    if (allProductIds.length === 0) return;

    bulkPublishMutation.mutate({
      productIds: allProductIds,
      channelConnectionIds: masterTargetChannelIds,
      forceRepublish: true,
    });
  };

  const getChannelBadge = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'SHOPIFY':
        return { label: 'Shopify', icon: '🛍️', bg: 'bg-emerald-950 text-emerald-400 border-emerald-800/80' };
      case 'EBAY':
        return { label: 'eBay', icon: '🏷️', bg: 'bg-amber-950 text-amber-400 border-amber-800/80' };
      default:
        return { label: 'Custom', icon: '🌐', bg: 'bg-purple-950 text-purple-400 border-purple-800/80' };
    }
  };

  if (!isOpen) return null;

  const allFilteredIds = filteredProducts.map((p) => p._id);
  const areAllSelected =
    allFilteredIds.length > 0 && allFilteredIds.every((id) => selectedProductIds.includes(id));

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-7xl w-full h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Modal Top Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-600 to-amber-400 flex items-center justify-center shadow-lg shadow-amber-500/20 text-white shrink-0">
              <Unlink className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight text-white">Catalog Channel Coverage & Store Sync</h2>
                <span className="bg-amber-950 border border-amber-800/80 text-amber-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {filteredProducts.length} Products
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Review products with 0 store mappings or products missing from connected channels. Select target channels to publish and sync.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl transition cursor-pointer"
              title="Refresh list"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 text-sm font-bold px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              &times; Close
            </button>
          </div>
        </div>

        {/* Action Controls & Filters Bar */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 shrink-0 text-xs">
          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            <div className="relative min-w-[240px]">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search by Master SKU, Title, Brand..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-brand-500 transition"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  filterType === 'all'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Needs Mapping ({productsList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType('zero_only')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  filterType === 'zero_only'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                0-Mapped on Any Store ({productsList.filter((p) => p.isZeroMapped).length})
              </button>
              {activeChannels.some((c: any) => c.channelType === 'EBAY') && (
                <button
                  type="button"
                  onClick={() => setFilterType('missing_ebay')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    filterType === 'missing_ebay'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Missing eBay ({productsList.filter((p) => (p.missingChannels || []).some((c: any) => c.channelType === 'EBAY')).length})
                </button>
              )}
              {activeChannels.some((c: any) => c.channelType === 'SHOPIFY') && (
                <button
                  type="button"
                  onClick={() => setFilterType('missing_shopify')}
                  className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                    filterType === 'missing_shopify'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Missing Shopify ({productsList.filter((p) => (p.missingChannels || []).some((c: any) => c.channelType === 'SHOPIFY')).length})
                </button>
              )}
              <button
                type="button"
                onClick={() => setFilterType('unmapped_only')}
                className={`px-2.5 py-1.5 rounded-lg font-semibold transition cursor-pointer ${
                  filterType === 'unmapped_only'
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Previously Unmapped ({productsList.filter((p) => (p.unmappedFrom || []).length > 0).length})
              </button>
            </div>

            {/* Select All Button */}
            <button
              type="button"
              onClick={handleSelectAllToggle}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold border transition cursor-pointer ${
                areAllSelected
                  ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              <div
                className={`w-3.5 h-3.5 rounded flex items-center justify-center border ${
                  areAllSelected ? 'bg-brand-600 border-brand-500' : 'border-slate-600'
                }`}
              >
                {areAllSelected && <Check className="w-2.5 h-2.5 text-white" />}
              </div>
              <span>{areAllSelected ? 'Deselect All' : `Select All (${filteredProducts.length})`}</span>
            </button>
          </div>

          {/* Master Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* Button 1: Map Manually Selected Products at Once */}
            <button
              type="button"
              onClick={handlePushManuallySelected}
              disabled={selectedProductIds.length === 0 || bulkPublishMutation.isPending}
              className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-500 hover:to-indigo-500 text-white font-semibold px-4 py-2 rounded-xl shadow-lg shadow-brand-600/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Push checked products to their selected channels at once"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {bulkPublishMutation.isPending && selectedProductIds.length > 0
                  ? 'Publishing Selected...'
                  : `Publish Selected to Stores (${selectedProductIds.length})`}
              </span>
            </button>

            {/* Button 2: Publish All to Missing Channels */}
            <button
              type="button"
              onClick={() => setIsMasterChannelModalOpen(true)}
              disabled={filteredProducts.length === 0 || bulkPublishMutation.isPending}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Open channel selection and publish products to missing channels at once"
            >
              <Share2 className="w-4 h-4" />
              <span>Publish All to Missing Channels ({filteredProducts.length})</span>
            </button>
          </div>
        </div>

        {/* Scrollable Products Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/80 sticky top-0 z-10 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800 backdrop-blur">
              <tr>
                <th className="py-3.5 px-4 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={areAllSelected}
                    onChange={handleSelectAllToggle}
                    className="rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="py-3.5 px-4">Master SKU</th>
                <th className="py-3.5 px-4">Product Name & Brand</th>
                <th className="py-3.5 px-4 text-center">Total Stock</th>
                <th className="py-3.5 px-4">Channel Gap / Status</th>
                <th className="py-3.5 px-4 text-right">Price</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4">Select Channels to Map</th>
                <th className="py-3.5 px-4 text-right">Row Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-20 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
                      <span className="text-sm font-medium">Scanning catalog for 0-mapped products...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredProducts.length > 0 ? (
                filteredProducts.map((p: any) => {
                  const isChecked = selectedProductIds.includes(p._id);
                  const selectedChannels = productChannelSelections[p._id] || [];
                  const isRowPublishing =
                    publishingRowId === p._id ||
                    (bulkPublishMutation.isPending && selectedProductIds.includes(p._id));

                  const unmappedStores = p.unmappedFrom || [];
                  const availableChannels = p.availableChannels || [];

                  return (
                    <tr
                      key={p._id}
                      className={`hover:bg-slate-800/50 transition ${
                        isChecked ? 'bg-brand-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-4 px-4 text-center">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectProduct(p._id)}
                          className="rounded border-slate-700 bg-slate-800 text-brand-600 focus:ring-0 cursor-pointer"
                        />
                      </td>

                      {/* Master SKU */}
                      <td className="py-4 px-4 font-mono font-bold text-brand-400">
                        {p.masterSku}
                      </td>

                      {/* Product Name & Brand */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {p.images?.[0] ? (
                            <img
                              src={typeof p.images[0] === 'string' ? p.images[0] : p.images[0].url}
                              alt={p.title}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                              {p.title?.charAt(0) || 'P'}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-200 line-clamp-1">{p.title}</div>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                              {p.brand && <span className="text-slate-300 font-medium">{p.brand}</span>}
                              {p.category && (
                                <>
                                  <span>&bull;</span>
                                  <span>{p.category}</span>
                                </>
                              )}
                              <span>&bull;</span>
                              <span>{p.variants?.length || 1} variants</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Total Stock */}
                      <td className="py-4 px-4 text-center">
                        <span className="font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-md text-xs">
                          {p.totalStock ?? 0}
                        </span>
                      </td>

                      {/* Channel Gap / Status */}
                      <td className="py-4 px-4">
                        {unmappedStores.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            {unmappedStores.map((um: any, idx: number) => {
                              const badge = getChannelBadge(um.channelType);
                              return (
                                <div
                                  key={idx}
                                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-800/60 w-fit"
                                  title={`Unmapped: ${um.unmappedReason}`}
                                >
                                  <span>{badge.icon}</span>
                                  <span>Unmapped from {um.channelName}</span>
                                </div>
                              );
                            })}
                          </div>
                        ) : p.isZeroMapped ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-red-400 font-semibold bg-red-950/60 border border-red-800/60 px-2 py-0.5 rounded">
                            <AlertCircle className="w-3 h-3 shrink-0" />
                            <span>0-Mapped (Not on any store)</span>
                          </span>
                        ) : p.missingChannels && p.missingChannels.length > 0 ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-amber-400 font-semibold flex items-center gap-1">
                              <span>Missing on:</span>
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {p.missingChannels.map((mc: any, idx: number) => {
                                const badge = getChannelBadge(mc.channelType);
                                return (
                                  <span
                                    key={idx}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-950/60 text-amber-300 border border-amber-800/60"
                                  >
                                    <span>{badge.icon}</span>
                                    <span>{mc.channelName}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-emerald-400 font-medium">✓ Fully Mapped</span>
                        )}
                      </td>

                      {/* Price */}
                      <td className="py-4 px-4 text-right font-mono font-bold text-white">
                        {format(p.defaultRetailPrice)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>

                      {/* Select Channels to Map */}
                      <td className="py-4 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-sm">
                          {availableChannels.length > 0 ? (
                            availableChannels.map((c: any) => {
                              const badge = getChannelBadge(c.channelType);
                              const isSelected = selectedChannels.includes(c.channelConnectionId);

                              if (c.isMapped) {
                                return (
                                  <span
                                    key={c.channelConnectionId}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-800/40 opacity-70"
                                    title="Already actively mapped to this store"
                                  >
                                    <Check className="w-2.5 h-2.5" />
                                    <span>{c.channelName}</span>
                                  </span>
                                );
                              }

                              return (
                                <button
                                  key={c.channelConnectionId}
                                  type="button"
                                  onClick={() =>
                                    toggleChannelForProduct(p._id, c.channelConnectionId)
                                  }
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition cursor-pointer select-none ${
                                    isSelected
                                      ? 'bg-brand-600/30 border-brand-500 text-brand-200 shadow-sm'
                                      : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                                  }`}
                                  title={
                                    c.isPreviouslyUnmapped
                                      ? `Previously unmapped from ${c.channelName} - Click to select for re-mapping`
                                      : `Not yet mapped to ${c.channelName} - Click to select`
                                  }
                                >
                                  <div
                                    className={`w-3 h-3 rounded flex items-center justify-center border ${
                                      isSelected
                                        ? 'bg-brand-600 border-brand-500'
                                        : 'border-slate-500'
                                    }`}
                                  >
                                    {isSelected && <Check className="w-2 h-2 text-white" />}
                                  </div>
                                  <span>{badge.icon}</span>
                                  <span>{c.channelName}</span>
                                  {c.isPreviouslyUnmapped && (
                                    <span className="text-[9px] text-amber-400 font-bold ml-0.5">
                                      [Unmapped]
                                    </span>
                                  )}
                                </button>
                              );
                            })
                          ) : (
                            <span className="text-slate-500 text-[11px]">No active channels found</span>
                          )}
                        </div>
                      </td>

                      {/* Row Action: Push or Map to Selected Channels */}
                      <td className="py-4 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => handlePushRow(p)}
                          disabled={isRowPublishing || selectedChannels.length === 0}
                          className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white font-semibold text-xs px-3 py-1.5 rounded-xl shadow-md shadow-brand-600/20 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                          title="Push and map this product to selected channels"
                        >
                          <UploadCloud
                            className={`w-3.5 h-3.5 ${isRowPublishing ? 'animate-bounce' : ''}`}
                          />
                          <span>
                            {isRowPublishing
                              ? 'Pushing...'
                              : `Push to Channels (${selectedChannels.length})`}
                          </span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={9} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <p className="font-bold text-slate-200 text-base">
                        {filterType === 'zero_only'
                          ? '0 Products Found: All Catalog Products Mapped!'
                          : filterType === 'missing_ebay'
                          ? 'No Products Missing eBay!'
                          : filterType === 'missing_shopify'
                          ? 'No Products Missing Shopify!'
                          : filterType === 'unmapped_only'
                          ? 'No Previously Disconnected Products!'
                          : 'All Products Are Fully Mapped!'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {filterType === 'zero_only' && productsList.length > 0 ? (
                          <span>
                            Every product in your catalog is linked to at least 1 store.{' '}
                            <strong className="text-amber-400">{productsList.length} products</strong> are missing coverage on other active channels (e.g. eBay).
                          </span>
                        ) : searchTerm ? (
                          'No products matched your search term.'
                        ) : (
                          'Every product in your catalog is actively mapped to connected sales channels.'
                        )}
                      </p>
                      {filterType === 'zero_only' && productsList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setFilterType('all')}
                          className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-brand-600 hover:bg-brand-500 text-white shadow-md transition cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>View {productsList.length} Products Missing Channels</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Bottom Status Bar */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            <span>
              Selected:{' '}
              <strong className="text-white">{selectedProductIds.length}</strong> of{' '}
              <strong className="text-white">{filteredProducts.length}</strong> products
            </span>
            <span>&bull;</span>
            <span>
              Connected Stores: <strong className="text-emerald-400">{activeChannels.length} Active</strong>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* SUB-MODAL: Channel Picker for Master Button "Mapped All the Un-Mapped Products" */}
      {isMasterChannelModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-60 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-emerald-400" />
                  <span>Select Channels to Map All Products</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose which sales channels you want to push and map these{' '}
                  <strong className="text-white">{filteredProducts.length}</strong> products to:
                </p>
              </div>
              <button
                onClick={() => setIsMasterChannelModalOpen(false)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1 rounded-lg"
              >
                &times;
              </button>
            </div>

            {/* Channels Checklist */}
            <div className="space-y-2.5 my-4 max-h-[40vh] overflow-y-auto pr-1">
              {activeChannels.map((ch: any) => {
                const badge = getChannelBadge(ch.channelType);
                const isChecked = masterTargetChannelIds.includes(ch.id);

                return (
                  <div
                    key={ch.id}
                    onClick={() => {
                      setMasterTargetChannelIds((prev) =>
                        prev.includes(ch.id)
                          ? prev.filter((id) => id !== ch.id)
                          : [...prev, ch.id]
                      );
                    }}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition cursor-pointer select-none ${
                      isChecked
                        ? 'bg-slate-800/90 border-brand-500 shadow-md shadow-brand-500/10'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{badge.icon}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-200 text-xs">{ch.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-bold border ${badge.bg}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono mt-0.5 block">
                          {ch.channelType} Channel
                        </span>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                        isChecked
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600'
                      }`}
                    >
                      {isChecked && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsMasterChannelModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMapAll}
                disabled={masterTargetChannelIds.length === 0 || bulkPublishMutation.isPending}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-40 cursor-pointer"
              >
                <UploadCloud
                  className={`w-4 h-4 ${bulkPublishMutation.isPending ? 'animate-bounce' : ''}`}
                />
                <span>
                  {bulkPublishMutation.isPending
                    ? 'Publishing All...'
                    : `Confirm & Map All ${filteredProducts.length} Products`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
