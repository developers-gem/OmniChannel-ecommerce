'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  Unlink,
  Link2,
  RefreshCw,
  Search,
  AlertCircle,
  CheckCircle2,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Store,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useCurrency } from '@/lib/currency';

export default function UnmappedProductsPage() {
  const queryClient = useQueryClient();
  const { format } = useCurrency();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedChannel, setSelectedChannel] = useState<string>('all');
  const [notification, setNotification] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  // Fetch unmapped mappings from API
  const { data: unmappedResponse, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['unmapped-mappings', page, limit],
    queryFn: async () => {
      const res: any = await api.get(`/mappings/unmapped?page=${page}&limit=${limit}`);
      return res;
    },
  });

  const unmappedList = unmappedResponse?.data || [];
  const pagination = unmappedResponse?.pagination;

  // Remap mutation - restores mapping and re-creates/re-publishes product on channel store
  const remapMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.post(`/mappings/${id}/remap`);
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      setNotification({
        type: 'success',
        message: data?.data?.message || 'Product successfully re-mapped and restored to store!',
      });
      setTimeout(() => setNotification(null), 8000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to re-map product to channel store',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  // Permanent dismissal mutation
  const dismissMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/mappings/${id}/permanent`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unmapped-mappings'] });
      setNotification({
        type: 'info',
        message: 'Unmapped product record dismissed permanently.',
      });
      setTimeout(() => setNotification(null), 6000);
    },
    onError: (err: any) => {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to dismiss record',
      });
      setTimeout(() => setNotification(null), 6000);
    },
  });

  // Filter items locally by search term and selected channel
  const filteredList = unmappedList.filter((item: any) => {
    const title = (item.canonicalProductId?.title || item.channelProductId?.title || '').toLowerCase();
    const sku = (item.canonicalVariantId?.sku || item.channelProductId?.sku || '').toLowerCase();
    const matchesSearch = !searchTerm || title.includes(searchTerm.toLowerCase()) || sku.includes(searchTerm.toLowerCase());

    const channelType = item.channelConnectionId?.channelType || item.channelType;
    const matchesChannel = selectedChannel === 'all' || channelType === selectedChannel;

    return matchesSearch && matchesChannel;
  });

  const handleRemapClick = (item: any) => {
    const channelName = item.channelConnectionId?.name || 'store';
    const prodTitle = item.canonicalProductId?.title || item.channelProductId?.title || 'product';
    if (
      window.confirm(
        `Do you want to map "${prodTitle}" again on channel "${channelName}"? This will restore active two-way sync and re-publish it to the channel store.`
      )
    ) {
      remapMutation.mutate(item._id);
    }
  };

  const handleDismissClick = (id: string) => {
    if (window.confirm('Are you sure you want to permanently dismiss this record from the unmapped list?')) {
      dismissMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Unlink className="w-5 h-5" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Unmapped Products</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Review products that have been unmapped and removed from external stores (Shopify, eBay). You can re-map them back to the channel at any time.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
            title="Refresh unmapped products"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <Link
            href="/mappings"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-brand-600/30 transition"
          >
            <Link2 className="w-4 h-4" />
            <span>View Active Mappings</span>
          </Link>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs border shadow-lg ${
            notification.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-200'
              : notification.type === 'error'
              ? 'bg-red-950/80 border-red-800 text-red-200'
              : 'bg-slate-800/90 border-slate-700 text-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white text-xs px-2 py-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by product title or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 outline-none focus:border-brand-500 transition"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap">Filter by Store:</span>
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-300 text-xs rounded-xl px-3 py-2 outline-none focus:border-brand-500 transition cursor-pointer"
          >
            <option value="all">All Channels</option>
            <option value="SHOPIFY">Shopify Stores</option>
            <option value="EBAY">eBay Stores</option>
            <option value="CUSTOM_STORE">Custom Stores</option>
          </select>
        </div>
      </div>

      {/* Unmapped Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Product Details</th>
                <th className="py-3 px-4">Unmapped From Store</th>
                <th className="py-3 px-4">Unmapped Date</th>
                <th className="py-3 px-4">Status & Reason</th>
                <th className="py-3 px-4 text-right">Action / Re-Map</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                      <span>Loading unmapped products...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredList.length > 0 ? (
                filteredList.map((m: any) => {
                  const product = m.canonicalProductId;
                  const variant = m.canonicalVariantId;
                  const channel = m.channelConnectionId;
                  const chProduct = m.channelProductId;
                  const channelType = channel?.channelType || m.channelType;

                  return (
                    <tr key={m._id} className="hover:bg-slate-800/40 transition">
                      {/* Product Details */}
                      <td className="py-4 px-4">
                        <div className="flex items-start gap-3">
                          {product?.images?.[0] ? (
                            <img
                              src={typeof product.images[0] === 'string' ? product.images[0] : product.images[0].url}
                              alt={product.title}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-800 border border-slate-700 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-500 shrink-0 font-bold text-xs">
                              {product?.title?.charAt(0) || 'P'}
                            </div>
                          )}
                          <div>
                            <div className="font-semibold text-slate-200">
                              {product?.title || chProduct?.title || 'Unknown Product'}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px]">
                              <span className="font-mono text-brand-400 font-bold">
                                SKU: {variant?.sku || chProduct?.sku || 'N/A'}
                              </span>
                              {variant?.title && (
                                <span className="text-slate-400">&bull; {variant.title}</span>
                              )}
                              {variant?.retailPrice !== undefined && (
                                <span className="text-slate-400 font-mono">
                                  &bull; {format(variant.retailPrice)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Store it was unmapped from */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold w-fit ${
                              channelType === 'SHOPIFY'
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60'
                                : channelType === 'EBAY'
                                ? 'bg-amber-950/80 text-amber-400 border border-amber-800/60'
                                : 'bg-purple-950/80 text-purple-400 border border-purple-800/60'
                            }`}
                          >
                            <span>
                              {channelType === 'SHOPIFY'
                                ? '🛍️ Shopify'
                                : channelType === 'EBAY'
                                ? '🏷️ eBay'
                                : '🌐 Custom Store'}
                            </span>
                          </span>
                          <div className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                            <Store className="w-3.5 h-3.5 text-slate-400" />
                            <span>{channel?.name || 'Connected Store'}</span>
                          </div>
                          {chProduct?.externalProductId && (
                            <span className="text-[10px] font-mono text-slate-500">
                              Ext ID: {chProduct.externalProductId}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Unmapped Date */}
                      <td className="py-4 px-4 text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>
                            {m.unmappedAt
                              ? new Date(m.unmappedAt).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : m.updatedAt
                              ? new Date(m.updatedAt).toLocaleDateString()
                              : 'Recently'}
                          </span>
                        </div>
                      </td>

                      {/* Status & Reason */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-400 border border-amber-800/50 w-fit">
                            <Unlink className="w-3 h-3" />
                            <span>UNMAPPED & REMOVED</span>
                          </span>
                          <span className="text-[11px] text-slate-400 italic max-w-xs truncate" title={m.unmappedReason}>
                            {m.unmappedReason || 'Unmapped from product mapping page'}
                          </span>
                        </div>
                      </td>

                      {/* Actions: Re-map button & Dismiss */}
                      <td className="py-4 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemapClick(m)}
                            disabled={remapMutation.isPending}
                            className="flex items-center gap-2 bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold text-xs px-3.5 py-2 rounded-xl shadow-lg shadow-brand-600/20 transition disabled:opacity-50 cursor-pointer"
                            title="Re-map this product and restore it to this sales channel"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Do you want map again on this channel?</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDismissClick(m._id)}
                            disabled={dismissMutation.isPending}
                            className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition cursor-pointer"
                            title="Permanently dismiss record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <div className="flex flex-col items-center justify-center max-w-sm mx-auto text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-500 border border-slate-700/80">
                        <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-300 text-sm">No Unmapped Products Found</p>
                        <p className="text-xs text-slate-500">
                          {searchTerm || selectedChannel !== 'all'
                            ? 'No unmapped products match your search or channel filter.'
                            : 'All product mappings are currently active, or no products have been unmapped yet.'}
                        </p>
                      </div>
                      <Link
                        href="/mappings"
                        className="inline-flex items-center gap-2 text-xs font-semibold text-brand-400 hover:text-brand-300 pt-1"
                      >
                        <span>Go to Product Mapping</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {pagination && pagination.total > 0 && (
          <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 text-xs">
            <div className="flex items-center gap-3 text-slate-400">
              <span>
                Showing{' '}
                <strong className="text-white">
                  {Math.min((page - 1) * limit + 1, pagination.total)}
                </strong>{' '}
                to{' '}
                <strong className="text-white">
                  {Math.min(page * limit, pagination.total)}
                </strong>{' '}
                of <strong className="text-white">{pagination.total}</strong> unmapped products
              </span>
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
                <span className="text-[11px] text-slate-500">Per page:</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
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
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              <span className="px-2.5 text-slate-400 font-mono text-[11px]">
                Page {page} of {pagination.totalPages || 1}
              </span>

              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.totalPages || 1))}
                disabled={page >= (pagination.totalPages || 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
