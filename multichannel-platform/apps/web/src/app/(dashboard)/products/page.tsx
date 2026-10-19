'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  ExternalLink,
  Layers,
  Boxes,
  UploadCloud,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Share2,
  ArrowDownToLine,
  ShoppingBag,
  Globe,
  Tag,
  Check,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useCurrency } from '@/lib/currency';

export default function ProductsPage() {
  const { format } = useCurrency();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [statusFilter, setStatusFilter] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Import from Channels Modal states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importingChannelId, setImportingChannelId] = useState<string | null>(null);
  const [confirmReimportChannel, setConfirmReimportChannel] = useState<{
    id: string;
    name: string;
    channelType: string;
    count: number;
  } | null>(null);

  // Push to Channel Modal states
  const [pushModalProduct, setPushModalProduct] = useState<any | null>(null);
  const [pushingChannelId, setPushingChannelId] = useState<string | null>(null);
  const [confirmRepublishTarget, setConfirmRepublishTarget] = useState<{
    productId: string;
    productTitle: string;
    channelId: string;
    channelName: string;
    channelType: string;
  } | null>(null);

  // Fetch Canonical Products
  const { data: productResponse, isLoading } = useQuery({
    queryKey: ['canonical-products', search, page, pageSize, statusFilter],
    queryFn: async () => {
      let url = `/products?page=${page}&limit=${pageSize}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res: any = await api.get(url);
      return res;
    },
  });

  // Fetch Connected Channels
  const { data: channelsData } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const res: any = await api.get('/channels');
      return res.data || res;
    },
  });

  // Fetch Product Mappings
  const { data: mappingsData } = useQuery({
    queryKey: ['product-mappings'],
    queryFn: async () => {
      const res: any = await api.get('/mappings?limit=250');
      return res.data || [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
    },
  });

  // Push / Publish product to a specific connected channel
  const publishMutation = useMutation({
    mutationFn: async ({
      id,
      channelConnectionId,
      forceRepublish = false,
    }: {
      id: string;
      channelConnectionId?: string;
      forceRepublish?: boolean;
    }) => {
      setPublishingId(id);
      setPushingChannelId(channelConnectionId || 'all');
      setNotification(null);
      const res: any = await api.post(`/products/${id}/publish`, {
        channelConnectionId,
        forceRepublish,
      });
      return res.data || res;
    },
    onSuccess: (data: any, variables) => {
      setPublishingId(null);
      setPushingChannelId(null);
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });

      const info = data?.data || data;

      // If product is already mapped to this channel and not forceRepublish, ask user for confirmation
      if (info?.alreadyMapped && !variables.forceRepublish) {
        setConfirmRepublishTarget({
          productId: variables.id,
          productTitle: pushModalProduct?.title || 'Product',
          channelId: info.channelId || variables.channelConnectionId || '',
          channelName: info.channelName || 'Store',
          channelType: info.channelType || 'Sales Channel',
        });
        return;
      }

      setConfirmRepublishTarget(null);
      setPushModalProduct(null);
      setNotification({
        type: 'success',
        text: info?.message || `Successfully pushed and synchronized product to sales channels!`,
      });
      setTimeout(() => setNotification(null), 8000);
    },
    onError: (err: any) => {
      setPublishingId(null);
      setPushingChannelId(null);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to publish product to sales channel',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  // Import products from a specific channel into Master Catalog
  const importToCanonicalMutation = useMutation({
    mutationFn: async ({
      channelConnectionId,
      forceReimport = false,
    }: {
      channelConnectionId?: string;
      forceReimport?: boolean;
    }) => {
      setIsImporting(true);
      setImportingChannelId(channelConnectionId || 'all');
      setNotification(null);
      const res: any = await api.post('/sync/import-to-canonical', {
        channelConnectionId,
        forceReimport,
      });
      return res.data || res;
    },
    onSuccess: (data: any, variables) => {
      setIsImporting(false);
      setImportingChannelId(null);
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });

      const info = data?.data || data;

      // If products already imported and user didn't force reimport, prompt for confirmation
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
        return;
      }

      setConfirmReimportChannel(null);
      setIsImportModalOpen(false);
      setNotification({
        type: 'success',
        text:
          info?.message ||
          (variables.forceReimport
            ? 'Successfully re-synchronized and refreshed products!'
            : 'Successfully imported products!'),
      });
      setTimeout(() => setNotification(null), 8000);
    },
    onError: (err: any) => {
      setIsImporting(false);
      setImportingChannelId(null);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to import products from channel',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  const products = productResponse?.data || [];
  const pagination = productResponse?.pagination;
  const activeChannels = (channelsData || []).filter((c: any) => c.status === 'ACTIVE');

  // Helper to get mappings for a specific product and channel
  const getProductMappingsForChannel = (productId: string, channelId: string) => {
    return (mappingsData || []).filter((m: any) => {
      const prodId = m.canonicalProductId?._id || m.canonicalProductId;
      const chId = m.channelConnectionId?._id || m.channelConnectionId;
      return String(prodId) === String(productId) && String(chId) === String(channelId);
    });
  };

  // Helper to get all mappings for a product
  const getProductMappings = (productId: string) => {
    return (mappingsData || []).filter((m: any) => {
      const prodId = m.canonicalProductId?._id || m.canonicalProductId;
      return String(prodId) === String(productId);
    });
  };

  const getChannelBadge = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'SHOPIFY':
        return {
          label: 'Shopify',
          icon: '🛍️',
          bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
        };
      case 'EBAY':
        return {
          label: 'eBay',
          icon: '🏷️',
          bg: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
        };
      default:
        return {
          label: 'Custom Store',
          icon: '🌐',
          bg: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
        };
    }
  };

  const handleExportCsv = () => {
    window.open('http://localhost:5050/api/v1/csv/export', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">Canonical Catalog</h1>
            {pagination?.total !== undefined && (
              <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold px-2.5 py-0.5 rounded-full">
                {pagination.total} Master Products
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Internal master catalog synchronized across Shopify, eBay, and external storefronts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Replace Import from Shopify with Import from Channels */}
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition cursor-pointer"
            title="Import product listings from connected channels (Shopify, eBay, Custom)"
          >
            <ArrowDownToLine className="w-3.5 h-3.5" />
            <span>Import from Channels</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <Link
            href="/products/new"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Product</span>
          </Link>
        </div>
      </div>

      {/* Notification Banner */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs border shadow-lg ${
            notification.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/70 border-red-800/80 text-red-200'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium">{notification.text}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-auto text-slate-400 hover:text-white text-sm"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-lg">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by SKU, title, brand..."
            className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs pl-9 focus:ring-2 focus:ring-brand-500 outline-none"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs outline-none"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="DRAFT">Draft</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      {/* Products Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Master SKU</th>
                <th className="py-3 px-4">Product Name & Brand</th>
                <th className="py-3 px-4 text-center">Variants</th>
                <th className="py-3 px-4 text-center">Total Stock</th>
                <th className="py-3 px-4 text-center">Mapped Channels</th>
                <th className="py-3 px-4 text-right">Default Retail</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading canonical catalog...
                  </td>
                </tr>
              ) : products.length > 0 ? (
                products.map((p: any) => {
                  const pMappings = getProductMappings(p._id);
                  const mappedChannels = Array.from(
                    new Set(
                      pMappings.map(
                        (m: any) =>
                          m.channelType || m.channelConnectionId?.channelType || 'UNKNOWN'
                      )
                    )
                  );

                  return (
                    <tr key={p._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-400">
                        {p.masterSku}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-200">{p.title}</div>
                        {p.brand && (
                          <span className="text-[10px] text-slate-500 font-medium">{p.brand}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-300">
                        <span className="bg-slate-800 px-2 py-0.5 rounded text-[10px]">
                          {p.variants?.length || p.totalVariants || 1}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-semibold text-slate-300">
                        <span className="text-emerald-400 font-mono font-bold">
                          {p.totalStock ?? 0}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="bg-purple-950 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                            {pMappings.length || p.mappedCount || 0} mapped
                          </span>
                          {mappedChannels.length > 0 && (
                            <div className="flex items-center gap-1.5 text-[11px]">
                              {mappedChannels.map((type: any, idx: number) => {
                                const badge = getChannelBadge(type);
                                return (
                                  <span key={idx} title={`${badge.label} mapped`}>
                                    {badge.icon}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-semibold text-white">
                        {format(p.defaultRetailPrice)}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.status === 'ACTIVE'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Push / Publish to Channels Button */}
                          <button
                            onClick={() => setPushModalProduct(p)}
                            title="Push / Publish to Channels (Shopify, eBay)"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white rounded-lg border border-brand-500/30 transition text-[11px] font-semibold cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Channels</span>
                          </button>

                          <button
                            onClick={() => deleteMutation.mutate(p._id)}
                            title="Archive and Unmap"
                            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
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
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                    <span>No canonical products found. Click "Import from Channels" above or create one!</span>
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
                  {Math.min((page - 1) * pageSize + 1, pagination.total)}
                </strong>{' '}
                to{' '}
                <strong className="text-white">
                  {Math.min(page * pageSize, pagination.total)}
                </strong>{' '}
                of <strong className="text-white">{pagination.total}</strong> products
              </span>
              <div className="flex items-center gap-1.5 pl-3 border-l border-slate-800">
                <span className="text-[11px] text-slate-500">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
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

              <div className="flex items-center gap-1">
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                  .filter((pNum) => {
                    if (pagination.totalPages <= 7) return true;
                    if (pNum === 1 || pNum === pagination.totalPages) return true;
                    return Math.abs(pNum - page) <= 1;
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
                          onClick={() => setPage(pNum)}
                          className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            page === pNum
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
                onClick={() => setPage((prev) => Math.min(prev + 1, pagination.totalPages))}
                disabled={page >= pagination.totalPages}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700/80 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL 1: Import Products from Channels Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <ArrowDownToLine className="w-5 h-5 text-emerald-400" />
                  <span>Import Products from Channels</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Select which channel and store you want to import products from into your platform master catalog.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-500 hover:text-white text-lg font-bold p-1 rounded-lg transition"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {activeChannels.length > 0 ? (
                activeChannels.map((channel: any) => {
                  const chId = channel._id?._id || channel._id?.id || channel._id;
                  const isCurImporting = isImporting && importingChannelId === chId;
                  const badge = getChannelBadge(channel.channelType);

                  return (
                    <div
                      key={chId}
                      className="bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl pt-0.5">{badge.icon}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 text-sm">
                              {channel.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                            {channel.config?.storeDomain ||
                              channel.config?.baseUrl ||
                              channel.channelType}
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
                        className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 shrink-0 justify-center cursor-pointer"
                      >
                        <ArrowDownToLine
                          className={`w-3.5 h-3.5 ${isCurImporting ? 'animate-bounce' : ''}`}
                        />
                        <span>{isCurImporting ? 'Importing...' : 'Import from this Channel'}</span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center">
                  <p className="text-xs text-slate-400 mb-3">No active storefronts connected yet.</p>
                  <Link
                    href="/channels"
                    className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition"
                  >
                    Go to Channel Integrations
                  </Link>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Products Already Imported Confirmation Modal */}
      {confirmReimportChannel && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <RefreshCw className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white mb-2">
              Products are already imported
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              Products from <strong className="text-white">{confirmReimportChannel.name}</strong>{' '}
              ({confirmReimportChannel.count} products) are already imported in your Master Catalog.
            </p>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-400 mb-5 leading-relaxed">
              <strong className="text-slate-200 block mb-0.5">Incremental Deduplication:</strong>
              Do you want to import again? If someone added new products on{' '}
              {confirmReimportChannel.name}, only those new products will be added to your platform catalog without duplicating existing items.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmReimportChannel(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
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
                disabled={isImporting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>{isImporting ? 'Importing Again...' : 'Yes, Import Again'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Push Product to Sales Channels Modal */}
      {pushModalProduct && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-brand-400" />
                  <span>Push Product to Sales Channels</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose which sales channel and store to push and map this product to.
                </p>
              </div>
              <button
                onClick={() => setPushModalProduct(null)}
                className="text-slate-500 hover:text-white text-lg font-bold p-1 rounded-lg transition"
              >
                &times;
              </button>
            </div>

            {/* Selected Product Card */}
            <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 mb-4">
              <span className="text-[10px] text-brand-400 font-mono uppercase font-bold tracking-wider">
                Selected Canonical Product
              </span>
              <div className="text-sm font-bold text-white mt-0.5">{pushModalProduct.title}</div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300 font-mono">
                <span>SKU: <strong className="text-white">{pushModalProduct.masterSku}</strong></span>
                <span>&bull;</span>
                <span>Retail: <strong className="text-emerald-400">{format(pushModalProduct.defaultRetailPrice)}</strong></span>
                <span>&bull;</span>
                <span>Stock: <strong className="text-white">{pushModalProduct.totalStock ?? 0} units</strong></span>
              </div>
            </div>

            {/* Channels List */}
            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {activeChannels.length > 0 ? (
                activeChannels.map((channel: any) => {
                  const chId = channel._id?._id || channel._id?.id || channel._id;
                  const isCurPushing =
                    publishingId === pushModalProduct._id && pushingChannelId === chId;
                  const badge = getChannelBadge(channel.channelType);
                  const channelMappings = getProductMappingsForChannel(pushModalProduct._id, chId);
                  const isAlreadyMapped = channelMappings.length > 0;

                  return (
                    <div
                      key={chId}
                      className="bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="text-2xl pt-0.5">{badge.icon}</div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 text-sm">
                              {channel.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                            {channel.config?.storeDomain ||
                              channel.config?.baseUrl ||
                              channel.channelType}
                          </span>

                          <div className="mt-1.5 flex items-center gap-1.5">
                            {isAlreadyMapped ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md">
                                <Check className="w-3 h-3" />
                                <span>Already Mapped ({channelMappings.length} listing)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">
                                Not Mapped Yet
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          if (isAlreadyMapped) {
                            // Prompt confirmation to prevent redundant mapping
                            setConfirmRepublishTarget({
                              productId: pushModalProduct._id,
                              productTitle: pushModalProduct.title,
                              channelId: chId,
                              channelName: channel.name,
                              channelType: channel.channelType,
                            });
                          } else {
                            publishMutation.mutate({
                              id: pushModalProduct._id,
                              channelConnectionId: chId,
                              forceRepublish: false,
                            });
                          }
                        }}
                        disabled={publishingId === pushModalProduct._id}
                        className={`flex items-center gap-2 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg transition disabled:opacity-50 shrink-0 justify-center cursor-pointer ${
                          isAlreadyMapped
                            ? 'bg-amber-600/90 hover:bg-amber-500 text-white shadow-amber-600/20'
                            : 'bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20'
                        }`}
                      >
                        <UploadCloud
                          className={`w-3.5 h-3.5 ${isCurPushing ? 'animate-bounce' : ''}`}
                        />
                        <span>
                          {isCurPushing
                            ? 'Pushing...'
                            : isAlreadyMapped
                            ? 'Push Again'
                            : 'Push to Store'}
                        </span>
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-xl p-8 text-center">
                  <p className="text-xs text-slate-400 mb-3">No active storefronts connected yet.</p>
                  <Link
                    href="/channels"
                    className="inline-flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition"
                  >
                    Go to Channel Integrations
                  </Link>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 mt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setPushModalProduct(null)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Product Already Pushed / Mapped Confirmation Modal */}
      {confirmRepublishTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-4">
              <AlertCircle className="w-6 h-6" />
            </div>

            <h3 className="text-base font-bold text-white mb-2">Product is already mapped</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              <strong className="text-white">"{confirmRepublishTarget.productTitle}"</strong> is
              already mapped to{' '}
              <strong className="text-white">{confirmRepublishTarget.channelName}</strong> (
              {confirmRepublishTarget.channelType}).
            </p>
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 text-[11px] text-slate-400 mb-5 leading-relaxed">
              <strong className="text-slate-200 block mb-0.5">Data Consistency Protection:</strong>
              Do you want to push again? Pushing again will update and synchronize the latest price, stock levels, and product details on{' '}
              {confirmRepublishTarget.channelName} without creating duplicate listings or redundant mappings.
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmRepublishTarget(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  publishMutation.mutate({
                    id: confirmRepublishTarget.productId,
                    channelConnectionId: confirmRepublishTarget.channelId,
                    forceRepublish: true,
                  });
                  setConfirmRepublishTarget(null);
                }}
                disabled={publishingId === confirmRepublishTarget.productId}
                className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-amber-600/30 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {publishingId === confirmRepublishTarget.productId ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : null}
                <span>Yes, Push Again</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
