'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  GitMerge,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Link2,
  Trash2,
  ArrowRight,
  RefreshCw,
  Search,
  HelpCircle,
  ArrowDownToLine,
  Info,
  ChevronLeft,
  ChevronRight,
  Unlink,
} from 'lucide-react';
import { MappingConfidence } from '@multichannel/shared';
import { useCurrency } from '@/lib/currency';

export default function MappingPage() {
  const queryClient = useQueryClient();
  const { format } = useCurrency();
  const [activeTab, setActiveTab] = useState<'mapped' | 'suggestions'>('mapped');
  const [mappingsPage, setMappingsPage] = useState(1);
  const [mappingsLimit, setMappingsLimit] = useState(20);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [confirmReimportChannel, setConfirmReimportChannel] = useState<{
    id: string;
    name: string;
    channelType: string;
    count: number;
  } | null>(null);
  const [importNotification, setImportNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [importingChannelId, setImportingChannelId] = useState<string | null>(null);

  // Fetch mapped listings
  const { data: mappingsResponse, isLoading: mappingsLoading } = useQuery({
    queryKey: ['product-mappings', mappingsPage, mappingsLimit],
    queryFn: async () => {
      const res: any = await api.get(`/mappings?page=${mappingsPage}&limit=${mappingsLimit}`);
      return res;
    },
  });

  const mappingsData = mappingsResponse?.data || [];
  const mappingsPagination = mappingsResponse?.pagination;

  // Fetch connected channels
  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const res: any = await api.get('/channels');
      return res.data;
    },
  });

  // Fetch suggestions
  const { data: suggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['mapping-suggestions'],
    queryFn: async () => {
      const res: any = await api.get('/mappings/suggestions');
      return res.data;
    },
  });

  // Fetch count of unmapped products
  const { data: unmappedCountRes } = useQuery({
    queryKey: ['unmapped-mappings-count'],
    queryFn: async () => {
      const res: any = await api.get('/mappings/unmapped?page=1&limit=1');
      return res;
    },
  });
  const unmappedCount = unmappedCountRes?.pagination?.total || 0;

  // Map single listing
  const mapMutation = useMutation({
    mutationFn: async (payload: { canonicalVariantId: string; channelProductId: string; confidence?: string }) => {
      const res: any = await api.post('/mappings/map', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings-count'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
    },
  });

  // Bulk map
  const bulkMapMutation = useMutation({
    mutationFn: async (mappings: any[]) => {
      const res: any = await api.post('/mappings/bulk-map', { mappings });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings-count'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
    },
  });

  // Unmap single
  const unmapMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/mappings/${id}`);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings-count'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
      setImportNotification({
        type: 'success',
        message: data?.data?.message || 'Product listing unmapped and deleted from store',
      });
      setTimeout(() => setImportNotification(null), 8000);
    },
    onError: (err: any) => {
      setImportNotification({
        type: 'error',
        message: err.message || 'Failed to unmap product',
      });
      setTimeout(() => setImportNotification(null), 8000);
    },
  });

  // Reset / Unmap All
  const unmapAllMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.delete('/mappings');
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings-count'] });
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
      setImportNotification({
        type: 'success',
        message: data?.data?.message || 'All listings unmapped and removed from stores',
      });
      setTimeout(() => setImportNotification(null), 8000);
    },
  });

  // Import directly to master catalog with channel & re-import support
  const importToCanonicalMutation = useMutation({
    mutationFn: async ({
      channelConnectionId,
      forceReimport = false,
    }: {
      channelConnectionId?: string;
      forceReimport?: boolean;
    }) => {
      setImportingChannelId(channelConnectionId || 'all');
      const res: any = await api.post('/sync/import-to-canonical', {
        channelConnectionId,
        forceReimport,
      });
      return res.data;
    },
    onSuccess: (data: any, variables) => {
      setImportingChannelId(null);
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });

      const info = data?.data || data;
      // If products are already imported and user didn't force reimport, ask them if they want to import again!
      if (info?.alreadyImported && !variables.forceReimport) {
        const found = (channelsData || []).find(
          (c: any) => (c._id?._id || c._id?.id || c._id) === variables.channelConnectionId
        );
        setConfirmReimportChannel({
          id: variables.channelConnectionId || '',
          name: found?.name || info.channelName || 'Store',
          channelType: found?.channelType || info.channelType || 'Sales Channel',
          count: info.alreadyImportedCount || 0,
        });
      } else {
        setConfirmReimportChannel(null);
        setIsImportModalOpen(false);
        setImportNotification({
          type: 'success',
          message:
            info?.message ||
            (variables.forceReimport
              ? 'Successfully re-synchronized and refreshed products!'
              : 'Successfully imported products!'),
        });
        setTimeout(() => setImportNotification(null), 8000);
      }
    },
    onError: (err: any) => {
      setImportingChannelId(null);
      setImportNotification({
        type: 'error',
        message: err.message || 'Failed to import products from channel',
      });
      setTimeout(() => setImportNotification(null), 8000);
    },
  });

  const exactMatches = (suggestions || []).filter(
    (s: any) =>
      s.confidence === MappingConfidence.EXACT_SKU ||
      s.confidence === MappingConfidence.EXACT_BARCODE
  );

  const handleBulkAcceptExact = () => {
    if (exactMatches.length === 0) return;
    const toMap = exactMatches.map((s: any) => ({
      canonicalVariantId: s.suggestedVariant._id,
      channelProductId: s.channelProduct._id,
      confidence: s.confidence,
    }));
    bulkMapMutation.mutate(toMap);
  };

  const handleBulkAcceptAll = () => {
    if (!suggestions || suggestions.length === 0) return;
    const toMap = suggestions.map((s: any) => ({
      canonicalVariantId: s.suggestedVariant._id,
      channelProductId: s.channelProduct._id,
      confidence: s.confidence,
    }));
    bulkMapMutation.mutate(toMap);
  };

  const handleUnmapAllConfirm = () => {
    if (
      window.confirm(
        'Are you sure you want to unmap all active listings? This will safely unlink external Shopify listings from your master catalog so you can remap or re-import them correctly.'
      )
    ) {
      unmapAllMutation.mutate();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Product Listing Mapping</h1>
          <p className="text-xs text-slate-400 mt-1">
            Map external listings from Shopify, eBay, and custom channels to platform master variants for two-way sync
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition"
            title="Import product listings from connected channels (Shopify, eBay, Custom)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Import from Channels</span>
          </button>

          {activeTab === 'mapped' && mappingsData && mappingsData.length > 0 && (
            <button
              onClick={handleUnmapAllConfirm}
              disabled={unmapAllMutation.isPending}
              className="flex items-center gap-2 bg-red-950/60 hover:bg-red-900/60 text-red-300 border border-red-800/80 text-xs font-semibold px-3.5 py-2.5 rounded-xl transition disabled:opacity-50"
              title="Clear all mappings to fix mismatched snowboards or reset links"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>{unmapAllMutation.isPending ? 'Unmapping...' : 'Unmap All (Reset)'}</span>
            </button>
          )}

          {activeTab === 'suggestions' && exactMatches.length > 0 && (
            <button
              onClick={handleBulkAcceptExact}
              disabled={bulkMapMutation.isPending}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>
                {bulkMapMutation.isPending
                  ? 'Mapping...'
                  : `Accept ${exactMatches.length} Exact Matches`}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Notification Banner */}
      {importNotification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs border shadow-lg ${
            importNotification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : 'bg-red-950/80 border-red-800 text-red-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {importNotification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{importNotification.message}</span>
          </div>
          <button
            onClick={() => setImportNotification(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Educational Banner */}
      {showInfoBanner && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-brand-600/20 border border-brand-500/30 flex items-center justify-center shrink-0 mt-0.5 text-brand-400">
              <Info className="w-4 h-4" />
            </div>
            <div className="text-xs text-slate-300 space-y-1">
              <span className="font-bold text-white text-sm block">How Product Mapping & Suggestions Work:</span>
              <p className="text-slate-400 leading-relaxed">
                <strong className="text-white">Suggestions</strong> are external listings detected from your connected Shopify store that need to be linked to your platform's master catalog. The platform analyzes your catalog and suggests matches:
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/60">
                  <span className="text-emerald-400 font-bold block mb-0.5">1. EXACT SKU</span>
                  Shopify variant SKU exactly equals Master product SKU. (Recommended)
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/60">
                  <span className="text-blue-400 font-bold block mb-0.5">2. EXACT BARCODE</span>
                  Shopify UPC/barcode matches Master barcode.
                </div>
                <div className="bg-slate-800/60 p-2 rounded-lg border border-slate-700/60">
                  <span className="text-purple-400 font-bold block mb-0.5">3. TITLE MATCH</span>
                  Product title exactly matches Master title.
                </div>
              </div>
              <p className="text-slate-400 text-[11px] pt-1">
                Once mapped, stock changes and price updates are automatically mirrored between the platform and Shopify.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowInfoBanner(false)}
            className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1 rounded"
          >
            &times;
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('mapped')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'mapped'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Link2 className="w-3.5 h-3.5 text-blue-400" />
          <span>Active Mappings</span>
          {(mappingsPagination?.total !== undefined || (mappingsData && mappingsData.length > 0)) && (
            <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {mappingsPagination?.total ?? mappingsData.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('suggestions')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
            activeTab === 'suggestions'
              ? 'bg-slate-800 text-white border border-slate-700'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-brand-400" />
          <span>Suggestions</span>
          {suggestions && suggestions.length > 0 && (
            <span className="bg-brand-600/20 text-brand-400 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {suggestions.length}
            </span>
          )}
        </button>

        <Link
          href="/unmapped-products"
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white hover:bg-slate-800/40 cursor-pointer"
          title="View all unmapped products removed from stores"
        >
          <Unlink className="w-3.5 h-3.5 text-amber-400" />
          <span>Unmapped Products</span>
          {unmappedCount > 0 && (
            <span className="bg-amber-950/80 text-amber-400 border border-amber-800/60 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {unmappedCount}
            </span>
          )}
        </Link>
      </div>

      {/* Tab 1: Active Mappings */}
      {activeTab === 'mapped' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Channel Listing</th>
                  <th className="py-3 px-4">Sales Channel (Source)</th>
                  <th className="py-3 px-4">Mapped Canonical Variant</th>
                  <th className="py-3 px-4 text-center">Confidence</th>
                  <th className="py-3 px-4 text-center">Sync Rules</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {mappingsLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      Loading mapped listings...
                    </td>
                  </tr>
                ) : mappingsData && mappingsData.length > 0 ? (
                  mappingsData.map((m: any) => (
                    <tr key={m._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">
                          {m.channelProductId?.title || 'External Listing'}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-mono text-slate-400">
                            SKU: {m.channelProductId?.sku || 'N/A'}
                          </span>
                          {m.channelProductId?.price !== undefined && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              &bull; {format(m.channelProductId.price)}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold w-fit ${
                            m.channelType === 'SHOPIFY'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : m.channelType === 'EBAY'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                              : 'bg-purple-950 text-purple-400 border border-purple-800/60'
                          }`}>
                            <span>{m.channelType === 'SHOPIFY' ? '🛍️ Shopify' : m.channelType === 'EBAY' ? '🏷️ eBay' : '🌐 Custom'}</span>
                          </span>
                          <span className="text-[11px] font-medium text-slate-300">
                            {m.channelConnectionId?.name || (typeof m.channelConnectionId === 'string' ? m.channelConnectionId : 'Default Store')}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-brand-400 font-mono">
                          {m.canonicalVariantId?.sku}
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {m.canonicalVariantId?.title}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.mappingConfidence === MappingConfidence.EXACT_SKU
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-blue-950 text-blue-400 border border-blue-800/60'
                        }`}>
                          {m.mappingConfidence}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400">
                          <span className={m.syncInventory ? 'text-emerald-400 font-semibold' : ''}>
                            Stock
                          </span>
                          <span>&bull;</span>
                          <span className={m.syncPrice ? 'text-emerald-400 font-semibold' : ''}>
                            Price
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => unmapMutation.mutate(m._id)}
                          title="Unmap this product"
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      No active product mappings found. Switch to Suggestions or click "Import from Channels" to link your catalog!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar for Active Mappings */}
          {mappingsPagination && mappingsPagination.total > 0 && (
            <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 text-xs">
              <div className="flex items-center gap-3 text-slate-400">
                <span>
                  Showing{' '}
                  <strong className="text-white">
                    {Math.min((mappingsPage - 1) * mappingsLimit + 1, mappingsPagination.total)}
                  </strong>{' '}
                  to{' '}
                  <strong className="text-white">
                    {Math.min(mappingsPage * mappingsLimit, mappingsPagination.total)}
                  </strong>{' '}
                  of <strong className="text-white">{mappingsPagination.total}</strong> mappings
                </span>
                <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
                  <span className="text-[11px] text-slate-500">Per page:</span>
                  <select
                    value={mappingsLimit}
                    onChange={(e) => {
                      setMappingsLimit(Number(e.target.value));
                      setMappingsPage(1);
                    }}
                    className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                  >
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMappingsPage((prev) => Math.max(prev - 1, 1))}
                  disabled={mappingsPage <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: mappingsPagination.totalPages }, (_, i) => i + 1)
                    .filter((pNum) => {
                      if (mappingsPagination.totalPages <= 7) return true;
                      if (pNum === 1 || pNum === mappingsPagination.totalPages) return true;
                      return Math.abs(pNum - mappingsPage) <= 1;
                    })
                    .map((pNum, idx, arr) => {
                      const prevNum = arr[idx - 1];
                      const showEllipsis = prevNum && pNum - prevNum > 1;
                      return (
                        <React.Fragment key={pNum}>
                          {showEllipsis && (
                            <span className="px-1 text-slate-500 text-xs">...</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setMappingsPage(pNum)}
                            className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                              mappingsPage === pNum
                                ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30'
                                : 'bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
                            }`}
                          >
                            {pNum}
                          </button>
                        </React.Fragment>
                      );
                    })}
                </div>

                <button
                  type="button"
                  onClick={() => setMappingsPage((prev) => Math.min(prev + 1, mappingsPagination.totalPages))}
                  disabled={mappingsPage >= mappingsPagination.totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Suggestions */}
      {activeTab === 'suggestions' && (
        <div className="space-y-4">
          {suggestionsLoading ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Analyzing channel catalog and computing matching signals...
            </div>
          ) : suggestions && suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:border-slate-700 transition"
                >
                  {/* Channel listing side */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                        {item.channelProduct.channelType}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {item.channelProduct.channelConnectionId?.name}
                      </span>
                    </div>
                    <div className="text-sm font-semibold text-slate-200">
                      {item.channelProduct.title}
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-slate-400 font-mono">
                      <span>SKU: {item.channelProduct.sku || 'N/A'}</span>
                      {item.channelProduct.barcode && (
                        <span>UPC: {item.channelProduct.barcode}</span>
                      )}
                      <span className="text-white font-semibold">
                        {format(item.channelProduct.price ?? 0)}
                      </span>
                    </div>
                  </div>

                  {/* Signal Indicator */}
                  <div className="hidden md:flex flex-col items-center px-4">
                    <div
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${
                        item.confidence === MappingConfidence.EXACT_SKU
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/80'
                          : item.confidence === MappingConfidence.EXACT_BARCODE
                          ? 'bg-blue-950 text-blue-400 border border-blue-800/80'
                          : 'bg-purple-950 text-purple-400 border border-purple-800/80'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{item.matchReason}</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-600 mt-1" />
                  </div>

                  {/* Canonical Match Candidate */}
                  <div className="flex-1 bg-slate-800/40 border border-slate-800 rounded-xl p-3">
                    <span className="text-[10px] font-bold uppercase text-brand-400 block mb-1">
                      Matches Master Variant
                    </span>
                    <div className="text-xs font-semibold text-white">
                      {item.suggestedVariant.title || item.suggestedProduct?.title}
                    </div>
                    <div className="mt-1 text-xs font-mono text-slate-400 flex items-center gap-2">
                      <span className="text-brand-400 font-bold">{item.suggestedVariant.sku}</span>
                      <span>Master Product</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div>
                    <button
                      onClick={() =>
                        mapMutation.mutate({
                          canonicalVariantId: item.suggestedVariant._id,
                          channelProductId: item.channelProduct._id,
                          confidence: item.confidence,
                        })
                      }
                      disabled={mapMutation.isPending}
                      className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition"
                    >
                      <Check className="w-4 h-4" />
                      <span>Confirm Link</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">All channel listings are mapped!</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                There are currently no unmatched external products detected from your connected storefronts.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Channel Import Modal */}
      {isImportModalOpen && !confirmReimportChannel && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                  <span>Import Products from Channels</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Choose a connected sales channel to import products into your Master Catalog. If you added new products on Shopify or eBay, only those new products will be imported.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-500 hover:text-slate-300 text-sm px-2 py-1 rounded"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {channelsLoading ? (
                <div className="py-8 text-center text-xs text-slate-500">
                  Loading connected channels...
                </div>
              ) : channelsData && channelsData.length > 0 ? (
                channelsData.map((channel: any) => {
                  const chId = channel._id?._id || channel._id?.id || channel._id;
                  const isImporting = importingChannelId === chId;

                  return (
                    <div
                      key={chId}
                      className="bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-lg shrink-0">
                          {channel.channelType === 'SHOPIFY' && '🛍️'}
                          {channel.channelType === 'EBAY' && '🏷️'}
                          {channel.channelType !== 'SHOPIFY' && channel.channelType !== 'EBAY' && '🌐'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              {channel.name}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              channel.channelType === 'SHOPIFY'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                : channel.channelType === 'EBAY'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                : 'bg-purple-950 text-purple-400 border border-purple-800/60'
                            }`}>
                              {channel.channelType}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 mt-0.5 block">
                            {channel.totalListings || 0} listings in channel &bull; {channel.totalMapped || 0} mapped
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          importToCanonicalMutation.mutate({
                            channelConnectionId: chId,
                            forceReimport: false,
                          })
                        }
                        disabled={isImporting}
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 shrink-0 w-full sm:w-auto justify-center"
                      >
                        <ArrowDownToLine className={`w-3.5 h-3.5 ${isImporting ? 'animate-bounce' : ''}`} />
                        <span>{isImporting ? 'Importing...' : 'Import from this Channel'}</span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center">
                  <p className="text-xs text-slate-400 mb-3">No active storefronts connected yet.</p>
                  <a
                    href="/channels"
                    className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition"
                  >
                    Go to Channel Integrations
                  </a>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Already Imported Confirmation Modal */}
      {confirmReimportChannel && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white mb-2">
              Products are already imported
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              Products from <strong className="text-white">{confirmReimportChannel.name}</strong> ({confirmReimportChannel.count} products) are already imported in your Master Catalog.
            </p>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-400 mb-5 leading-relaxed">
              <strong className="text-slate-200 block mb-0.5">Incremental Import:</strong>
              Do you want to import again? This will re-synchronize latest details. If you added new products on {confirmReimportChannel.name}, only those new products will be added to the catalog without duplicating existing items.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmReimportChannel(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  importToCanonicalMutation.mutate({
                    channelConnectionId: confirmReimportChannel.id,
                    forceReimport: true,
                  })
                }
                disabled={importToCanonicalMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {importToCanonicalMutation.isPending ? 'Importing Again...' : 'Import Again'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
