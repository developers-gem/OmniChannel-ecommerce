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
} from 'lucide-react';
import { MappingConfidence } from '@multichannel/shared';

export default function MappingPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'mapped' | 'suggestions'>('suggestions');

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
    mutationFn: async (payload: { canonicalVariantId: string; channelProductId: string }) => {
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

  // Unmap
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

  const handleBulkAccept = () => {
    if (!suggestions || suggestions.length === 0) return;
    const toMap = suggestions.map((s: any) => ({
      canonicalVariantId: s.suggestedVariant._id,
      channelProductId: s.channelProduct._id,
    }));
    bulkMapMutation.mutate(toMap);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Product Listing Mapping</h1>
          <p className="text-xs text-slate-400 mt-1">
            Map external Shopify, eBay, and Webstore listings to canonical master variants
          </p>
        </div>

        {activeTab === 'suggestions' && suggestions && suggestions.length > 0 && (
          <button
            onClick={handleBulkAccept}
            disabled={bulkMapMutation.isPending}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span>
              {bulkMapMutation.isPending
                ? 'Mapping all...'
                : `Accept All ${suggestions.length} Exact Matches`}
            </span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
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
      </div>

      {/* Tab 1: Suggestions */}
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
                          : 'bg-blue-950 text-blue-400 border border-blue-800/80'
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
                      <span>Stock on Hand: Available</span>
                    </div>
                  </div>

                  {/* Action */}
                  <div>
                    <button
                      onClick={() =>
                        mapMutation.mutate({
                          canonicalVariantId: item.suggestedVariant._id,
                          channelProductId: item.channelProduct._id,
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
                There are currently no unmatched external products detected from your connected
                storefronts.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Active Mappings */}
      {activeTab === 'mapped' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Channel Listing</th>
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
                        <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
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
                          title="Safe Unmap"
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
                      No active product mappings found. Switch to Suggestions to link products.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
