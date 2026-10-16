'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
} from 'lucide-react';
import { MappingConfidence } from '@multichannel/shared';

export default function MappingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'mapped' | 'suggestions'>('mapped');
  const [showInfoBanner, setShowInfoBanner] = useState(true);

  // Fetch mapped listings
  const { data: mappingsData, isLoading: mappingsLoading } = useQuery({
    queryKey: ['product-mappings'],
    queryFn: async () => {
      const res: any = await api.get('/mappings');
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

  // Map single listing
  const mapMutation = useMutation({
    mutationFn: async (payload: { canonicalVariantId: string; channelProductId: string; confidence?: string }) => {
      const res: any = await api.post('/mappings/map', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
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
    },
  });

  // Unmap single
  const unmapMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/mappings/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
    },
  });

  // Reset / Unmap All
  const unmapAllMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.delete('/mappings');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
    },
  });

  // Import directly to master catalog
  const importToCanonicalMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.post('/sync/import-to-canonical', {});
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
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
            Map external Shopify listings to platform master variants for two-way inventory and price sync
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => importToCanonicalMutation.mutate()}
            disabled={importToCanonicalMutation.isPending}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50"
            title="Import all Shopify products into the platform master catalog"
          >
            <ArrowDownToLine className={`w-3.5 h-3.5 ${importToCanonicalMutation.isPending ? 'animate-bounce' : ''}`} />
            <span>
              {importToCanonicalMutation.isPending ? 'Importing...' : 'Import All from Shopify'}
            </span>
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
          {mappingsData && mappingsData.length > 0 && (
            <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {mappingsData.length}
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
      </div>

      {/* Tab 1: Active Mappings */}
      {activeTab === 'mapped' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Channel Listing (Shopify)</th>
                  <th className="py-3 px-4">Sales Channel</th>
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
                        <span className="text-[10px] font-mono text-slate-500">
                          SKU: {m.channelProductId?.sku || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {m.channelType}
                        </span>
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
                      No active product mappings found. Switch to Suggestions or click "Import All from Shopify" to link your catalog!
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                        ${item.channelProduct.price?.toFixed(2)}
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
    </div>
  );
}
