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
  Unlink,
  AlertTriangle,
  Loader2,
  Info,
  Percent,
  Store,
} from 'lucide-react';
import { useCurrency } from '@/lib/currency';
import { ZeroMappedModal } from '@/components/products/ZeroMappedModal';

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
  const [productToDelete, setProductToDelete] = useState<any | null>(null);
  const [deleteFromStores, setDeleteFromStores] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Channel filter state: 'ALL' | 'SHOPIFY' | 'EBAY' | 'CUSTOM_STORE' | 'ZERO_MAPPED'
  const [channelFilter, setChannelFilter] = useState<string>('ALL');

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const ch = params.get('channel') || params.get('channelType');
      if (ch) {
        const upper = ch.toUpperCase();
        if (upper.includes('SHOPIFY')) setChannelFilter('SHOPIFY');
        else if (upper.includes('EBAY')) setChannelFilter('EBAY');
        else if (upper.includes('CUSTOM')) setChannelFilter('CUSTOM_STORE');
        else if (upper.includes('ZERO') || upper.includes('UNMAPPED')) setChannelFilter('ZERO_MAPPED');
      }
    }
  }, []);

  const handleSelectChannelFilter = (type: string) => {
    setChannelFilter(type);
    setPage(1);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (type === 'ALL') {
        url.searchParams.delete('channel');
        url.searchParams.delete('channelType');
      } else {
        url.searchParams.set('channel', type.toLowerCase());
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  // 0-Mapped Products Modal state
  const [isZeroMappedModalOpen, setIsZeroMappedModalOpen] = useState(false);
  const [zeroMappedInitialFilter, setZeroMappedInitialFilter] = useState<
    'all' | 'zero_only' | 'missing_ebay' | 'missing_shopify' | 'unmapped_only'
  >('zero_only');

  // Fetch unified catalog & multi-store summary counts
  const { data: summaryResponse } = useQuery({
    queryKey: ['products-summary-counts'],
    queryFn: async () => {
      const res: any = await api.get('/products/summary-counts');
      return res?.data;
    },
  });
  const summary = summaryResponse;

  // Fetch 0-mapped products count
  const { data: zeroMappedCountData } = useQuery({
    queryKey: ['zero-mapped-count'],
    queryFn: async () => {
      const res: any = await api.get('/products/zero-mapped');
      return res;
    },
  });
  const zeroMappedCount = zeroMappedCountData?.totalZeroMapped ?? summary?.zeroMappedProducts ?? 0;
  const incompleteMappedCount = zeroMappedCountData?.totalPartiallyMapped ?? summary?.incompleteMappedProducts ?? 0;

  // Export CSV Modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Quick Sync from Stores state
  const [isQuickSyncing, setIsQuickSyncing] = useState(false);

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
  const [selectedPushChannelIds, setSelectedPushChannelIds] = useState<string[]>([]);
  const [pushChannelMarkups, setPushChannelMarkups] = useState<Record<string, number>>({});
  const [customPushMarkupInputs, setCustomPushMarkupInputs] = useState<Record<string, string>>({});
  const [confirmRepublishTarget, setConfirmRepublishTarget] = useState<{
    productId: string;
    productTitle: string;
    channelId: string;
    channelName: string;
    channelType: string;
  } | null>(null);

  // Fetch Canonical Products
  const { data: productResponse, isLoading } = useQuery({
    queryKey: ['canonical-products', search, page, pageSize, statusFilter, channelFilter],
    queryFn: async () => {
      let url = `/products?page=${page}&limit=${pageSize}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (channelFilter && channelFilter !== 'ALL') url += `&channelType=${channelFilter}`;
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
    mutationFn: async ({ id, deleteFromStores }: { id: string; deleteFromStores: boolean }) => {
      setDeletingId(id);
      const res: any = await api.delete(`/products/${id}?deleteFromStores=${deleteFromStores}`, {
        data: { deleteFromStores },
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      queryClient.invalidateQueries({ queryKey: ['products-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setProductToDelete(null);
      setDeletingId(null);
      setNotification({
        type: 'success',
        text:
          data?.data?.message ||
          data?.message ||
          'Product successfully unmapped from connected channels and deleted from platform!',
      });
      setTimeout(() => setNotification(null), 8000);
    },
    onError: (err: any) => {
      setDeletingId(null);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to unmap and delete product',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  // Push / Publish product to a specific connected channel
  const publishMutation = useMutation({
    mutationFn: async ({
      id,
      channelConnectionId,
      channelConnectionIds,
      channelMarkups,
      forceRepublish = false,
    }: {
      id: string;
      channelConnectionId?: string;
      channelConnectionIds?: string[];
      channelMarkups?: Record<string, number>;
      forceRepublish?: boolean;
    }) => {
      setPublishingId(id);
      setPushingChannelId(channelConnectionId || (channelConnectionIds && channelConnectionIds.length > 0 ? 'bulk' : 'all'));
      setNotification(null);
      const res: any = await api.post(`/products/${id}/publish`, {
        channelConnectionId,
        channelConnectionIds,
        channelMarkups,
        forceRepublish,
        shippingCharge: pushModalProduct?.shippingCharge || 0,
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
      const raw = err?.response?.data?.error?.message || err.message || 'Failed to publish product to sales channel';
      let clean = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (raw.includes('25002') || raw.toLowerCase().includes('exceed')) {
        clean = 'eBay Monthly Selling Limit Reached (Error 25002): Your eBay seller account has reached its monthly listing allowance. Request a limit increase in eBay Seller Hub or lower the stock quantity.';
      } else if (raw.includes('25016') || raw.toLowerCase().includes('minimum price of 0.99')) {
        clean = 'eBay Minimum Price Requirement (Error 25016): The price of this product or its variants is below eBay’s minimum allowed price of 0.99. Please set the retail price to at least 0.99 and push again.';
      }
      setNotification({
        type: 'error',
        text: clean,
      });
      setTimeout(() => setNotification(null), 12000);
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
          borderActive: 'border-emerald-500 bg-emerald-950/20 shadow-emerald-500/10',
          defaultFee: 5,
        };
      case 'EBAY':
        return {
          label: 'eBay',
          icon: '🏷️',
          bg: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
          borderActive: 'border-amber-500 bg-amber-950/20 shadow-amber-500/10',
          defaultFee: 15,
        };
      case 'AMAZON':
        return {
          label: 'Amazon',
          icon: '📦',
          bg: 'bg-yellow-950/80 text-yellow-400 border-yellow-800/80',
          borderActive: 'border-yellow-500 bg-yellow-950/20 shadow-yellow-500/10',
          defaultFee: 15,
        };
      default:
        return {
          label: 'Custom Store',
          icon: '🌐',
          bg: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
          borderActive: 'border-purple-500 bg-purple-950/20 shadow-purple-500/10',
          defaultFee: 10,
        };
    }
  };

  const openPushModal = (prod: any) => {
    setPushModalProduct(prod);
    const channelIds = activeChannels.map((c: any) => c._id?._id || c._id?.id || c._id);
    setSelectedPushChannelIds(channelIds);

    const initialMarkups: Record<string, number> = {};
    for (const c of activeChannels) {
      const chId = c._id?._id || c._id?.id || c._id;
      const badge = getChannelBadge(c.channelType);
      initialMarkups[chId] = badge.defaultFee;
    }
    setPushChannelMarkups(initialMarkups);
    setCustomPushMarkupInputs({});
  };

  const togglePushChannelSelection = (chId: string) => {
    setSelectedPushChannelIds((prev) =>
      prev.includes(chId) ? prev.filter((id) => id !== chId) : [...prev, chId]
    );
  };

  const selectAllPushChannels = () => {
    setSelectedPushChannelIds(activeChannels.map((c: any) => c._id?._id || c._id?.id || c._id));
  };

  const deselectAllPushChannels = () => {
    setSelectedPushChannelIds([]);
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res: any = await api.get('/csv/export', {
        responseType: 'blob',
      });

      const blob = res instanceof Blob
        ? res
        : new Blob([res], { type: 'text/csv;charset=utf-8;' });

      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `canonical-products-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);

      setIsExportModalOpen(false);
      setNotification({
        type: 'success',
        text: 'Products catalog exported to CSV successfully!',
      });
      setTimeout(() => setNotification(null), 6000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: err?.message || 'Failed to export products to CSV',
      });
      setTimeout(() => setNotification(null), 6000);
    } finally {
      setIsExporting(false);
    }
  };

  const handleQuickSyncFromStores = async () => {
    setIsQuickSyncing(true);
    setNotification(null);
    try {
      const res: any = await api.post('/sync/trigger', {
        jobType: 'CATALOG_IMPORT',
      });
      await queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      await queryClient.invalidateQueries({ queryKey: ['products-summary-counts'] });
      await queryClient.invalidateQueries({ queryKey: ['zero-mapped-count'] });
      await queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      await queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      setNotification({
        type: 'success',
        text: res?.data?.message || res?.message || 'Successfully synchronized latest product details and stock from connected stores!',
      });
      setTimeout(() => setNotification(null), 6000);
    } catch (err: any) {
      setNotification({
        type: 'error',
        text: err?.message || 'Failed to sync from stores',
      });
      setTimeout(() => setNotification(null), 6000);
    } finally {
      setIsQuickSyncing(false);
    }
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
          {/* Button 1: 0-Mapped Products */}
          <button
            type="button"
            onClick={() => {
              setZeroMappedInitialFilter('zero_only');
              setIsZeroMappedModalOpen(true);
            }}
            className={`flex items-center gap-2 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg transition cursor-pointer ${
              zeroMappedCount > 0
                ? 'bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 shadow-red-600/20 animate-pulse'
                : 'bg-gradient-to-r from-slate-800 to-slate-700 hover:from-slate-700 hover:to-slate-600 border border-slate-700 text-slate-300'
            }`}
            title="View products with strictly 0 channel mappings across all stores"
          >
            <Unlink className="w-3.5 h-3.5 text-slate-400" />
            <span>0-Mapped Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                zeroMappedCount > 0
                  ? 'bg-red-950 text-red-300 border-red-700'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {zeroMappedCount}
            </span>
          </button>

          {/* Button 2: Missing Channels (shown when products are mapped to some stores, but missing others) */}
          {incompleteMappedCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setZeroMappedInitialFilter('all');
                setIsZeroMappedModalOpen(true);
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-amber-600/20 transition cursor-pointer"
              title={`${incompleteMappedCount} products are on some channels but missing others (e.g. missing eBay). Click to publish.`}
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Missing Channels</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/90 text-amber-300 border border-amber-800/80">
                {incompleteMappedCount}
              </span>
            </button>
          )}

          {/* Quick Sync Inbound from Connected Stores */}
          <button
            onClick={handleQuickSyncFromStores}
            disabled={isQuickSyncing}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition disabled:opacity-50 cursor-pointer"
            title="Fetch and synchronize latest updates, title changes, and stock from Shopify & connected stores"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isQuickSyncing ? 'animate-spin' : ''}`} />
            <span>{isQuickSyncing ? 'Syncing Stores...' : 'Sync from Stores'}</span>
          </button>

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
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition cursor-pointer"
            title="Export master products and inventory to CSV"
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

      {/* Catalog & Multi-Store Channel Distribution Overview Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Master Products Card */}
        <div
          onClick={() => handleSelectChannelFilter('ALL')}
          className={`border rounded-2xl p-4 shadow-lg flex items-center justify-between cursor-pointer transition select-none ${
            channelFilter === 'ALL'
              ? 'bg-slate-800/90 border-brand-500 ring-2 ring-brand-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
          }`}
          title="Click to view all master products"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider block">
                Total Master Products
              </span>
              {channelFilter === 'ALL' && (
                <span className="text-[9px] bg-brand-900/90 text-brand-300 border border-brand-700/80 px-1.5 py-0.2 rounded font-semibold">
                  Active
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-white mt-0.5">
              {summary?.totalMasterProducts ?? pagination?.total ?? 0}
            </div>
            <div className="text-[11px] text-purple-400 font-medium mt-0.5">
              {summary?.totalVariants ?? 0} SKUs / Variants in Catalog
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/80 flex items-center justify-center text-purple-400">
            <Package className="w-5 h-5" />
          </div>
        </div>

        {/* Shopify Storefront Products */}
        <div
          onClick={() => handleSelectChannelFilter('SHOPIFY')}
          className={`border rounded-2xl p-4 shadow-lg flex items-center justify-between cursor-pointer transition select-none ${
            channelFilter === 'SHOPIFY'
              ? 'bg-emerald-950/40 border-emerald-500 ring-2 ring-emerald-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-emerald-800/80 hover:bg-slate-850'
          }`}
          title="Click to see all Shopify products"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-wider">
                Shopify Products
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {channelFilter === 'SHOPIFY' && (
                <span className="text-[9px] bg-emerald-900 text-emerald-300 border border-emerald-700 px-1.5 py-0.2 rounded font-semibold">
                  Filtered
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-emerald-400 mt-0.5">
              {summary?.shopify?.storeProductsCount ?? summary?.shopify?.productsCount ?? 0}{' '}
              <span className="text-xs font-normal text-slate-400">store products</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              <strong className="text-slate-200">
                {summary?.shopify?.mappedCanonicalCount ?? summary?.shopify?.mappedCount ?? 0} /{' '}
                {summary?.shopify?.listingsCount ?? 0}
              </strong>{' '}
              Listings Mapped ({summary?.shopify?.mappedPercentage ?? 0}%)
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/80 flex items-center justify-center text-emerald-400">
            <ShoppingBag className="w-5 h-5" />
          </div>
        </div>

        {/* eBay Storefront Products */}
        <div
          onClick={() => handleSelectChannelFilter('EBAY')}
          className={`border rounded-2xl p-4 shadow-lg flex items-center justify-between cursor-pointer transition select-none ${
            channelFilter === 'EBAY'
              ? 'bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30'
              : 'bg-slate-900 border-slate-800 hover:border-amber-800/80 hover:bg-slate-850'
          }`}
          title="Click to see all eBay products"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-amber-400 uppercase font-bold tracking-wider">
                eBay Products
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
              {channelFilter === 'EBAY' && (
                <span className="text-[9px] bg-amber-900 text-amber-300 border border-amber-700 px-1.5 py-0.2 rounded font-semibold">
                  Filtered
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold text-amber-400 mt-0.5">
              {summary?.ebay?.storeProductsCount ?? summary?.ebay?.productsCount ?? 0}{' '}
              <span className="text-xs font-normal text-slate-400">store products</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              <strong className="text-slate-200">
                {summary?.ebay?.mappedCanonicalCount ?? summary?.ebay?.mappedCount ?? 0} /{' '}
                {summary?.ebay?.listingsCount ?? 0}
              </strong>{' '}
              Listings Mapped ({summary?.ebay?.mappedPercentage ?? 0}%)
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-950/60 border border-amber-800/80 flex items-center justify-center text-amber-400">
            <Tag className="w-5 h-5" />
          </div>
        </div>

        {/* 0-Mapped & Channel Gap Card */}
        <div
          onClick={() => handleSelectChannelFilter('ZERO_MAPPED')}
          className={`border rounded-2xl p-4 shadow-lg flex items-center justify-between cursor-pointer transition select-none ${
            channelFilter === 'ZERO_MAPPED'
              ? 'bg-red-950/50 border-red-500 ring-2 ring-red-500/30'
              : zeroMappedCount > 0
              ? 'bg-red-950/30 border-red-800/80 hover:bg-red-950/50'
              : incompleteMappedCount > 0
              ? 'bg-amber-950/20 border-amber-800/60 hover:bg-amber-950/40'
              : 'bg-slate-900 border-slate-800 hover:border-slate-700'
          }`}
          title="Click to view all 0-mapped products"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold tracking-wider block text-slate-400">
                {zeroMappedCount > 0
                  ? '0-Mapped Products'
                  : incompleteMappedCount > 0
                  ? 'Channel Coverage Gap'
                  : 'Catalog Status'}
              </span>
              {channelFilter === 'ZERO_MAPPED' && (
                <span className="text-[9px] bg-red-900 text-red-300 border border-red-700 px-1.5 py-0.2 rounded font-semibold">
                  Filtered
                </span>
              )}
            </div>
            <div className="text-xl font-extrabold mt-0.5 flex items-center gap-2">
              {zeroMappedCount > 0 ? (
                <span className="text-red-400">{zeroMappedCount} 0-Mapped</span>
              ) : incompleteMappedCount > 0 ? (
                <span className="text-amber-400">{incompleteMappedCount} Missing Channel</span>
              ) : (
                <span className="text-emerald-400">100% Fully Mapped</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
              {zeroMappedCount === 0 && incompleteMappedCount === 0 ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>All products mapped to all stores</span>
                </span>
              ) : zeroMappedCount === 0 ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  <span>All products mapped ({incompleteMappedCount} missing eBay)</span>
                </span>
              ) : (
                <span className="text-red-400 font-semibold">
                  {zeroMappedCount} added on platform, not on store
                </span>
              )}
            </div>
          </div>
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
              channelFilter === 'ZERO_MAPPED'
                ? 'bg-red-900 border-red-500 text-white'
                : zeroMappedCount > 0
                ? 'bg-red-950/60 border-red-800 text-red-400'
                : incompleteMappedCount > 0
                ? 'bg-amber-950/60 border-amber-800 text-amber-400'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            {zeroMappedCount > 0 ? (
              <Unlink className="w-5 h-5" />
            ) : incompleteMappedCount > 0 ? (
              <Share2 className="w-5 h-5" />
            ) : (
              <Check className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Channel Filter Buttons Row */}
      <div className="bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2.5 shadow-lg">
        <div className="flex flex-wrap items-center gap-2">
          {/* All Master Products Button */}
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('ALL')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              channelFilter === 'ALL'
                ? 'bg-brand-600 text-white border-brand-500 shadow-md shadow-brand-600/30'
                : 'bg-slate-850 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-750'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            <span>All Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] ${
                channelFilter === 'ALL'
                  ? 'bg-brand-700 text-white'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {summary?.totalMasterProducts ?? pagination?.total ?? 0}
            </span>
          </button>

          {/* See Shopify All Products Button */}
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('SHOPIFY')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              channelFilter === 'SHOPIFY'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 ring-2 ring-emerald-500/20'
                : 'bg-slate-850 hover:bg-emerald-950/40 text-emerald-400 border-slate-750 hover:border-emerald-800/80'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>See Shopify All Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                channelFilter === 'SHOPIFY'
                  ? 'bg-emerald-800 text-white'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }`}
            >
              {summary?.shopify?.mappedCanonicalCount ?? summary?.shopify?.mappedCount ?? 0}
            </span>
          </button>

          {/* See eBay All Products Button */}
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('EBAY')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              channelFilter === 'EBAY'
                ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30 ring-2 ring-amber-500/20'
                : 'bg-slate-850 hover:bg-amber-950/40 text-amber-400 border-slate-750 hover:border-amber-800/80'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            <span>See eBay All Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                channelFilter === 'EBAY'
                  ? 'bg-amber-800 text-white'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
              }`}
            >
              {summary?.ebay?.mappedCanonicalCount ?? summary?.ebay?.mappedCount ?? 0}
            </span>
          </button>

          {/* See Custom Website All Products Button */}
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('CUSTOM_STORE')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              channelFilter === 'CUSTOM_STORE'
                ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 ring-2 ring-purple-500/20'
                : 'bg-slate-850 hover:bg-purple-950/40 text-purple-400 border-slate-750 hover:border-purple-800/80'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>See Custom Website All Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                channelFilter === 'CUSTOM_STORE'
                  ? 'bg-purple-800 text-white'
                  : 'bg-purple-950 text-purple-300 border border-purple-800'
              }`}
            >
              {summary?.custom?.mappedCanonicalCount ?? summary?.custom?.mappedCount ?? 0}
            </span>
          </button>

          {/* See 0-Mapped Button */}
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('ZERO_MAPPED')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              channelFilter === 'ZERO_MAPPED'
                ? 'bg-red-600 text-white border-red-500 shadow-md shadow-red-600/30 ring-2 ring-red-500/20'
                : 'bg-slate-850 hover:bg-red-950/40 text-red-400 border-slate-750 hover:border-red-800/80'
            }`}
          >
            <Unlink className="w-3.5 h-3.5" />
            <span>See 0-Mapped Products</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                channelFilter === 'ZERO_MAPPED'
                  ? 'bg-red-800 text-white'
                  : 'bg-red-950 text-red-300 border border-red-800'
              }`}
            >
              {zeroMappedCount}
            </span>
          </button>
        </div>

        {/* Clear Active Filter Pill */}
        {channelFilter !== 'ALL' && (
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('ALL')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 transition cursor-pointer"
          >
            <span>&times; Reset Filter (Show All)</span>
          </button>
        )}
      </div>

      {/* Filter Status Badge (When a channel filter is active) */}
      {channelFilter !== 'ALL' && (
        <div className="flex items-center justify-between bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">Filtered by:</span>
            {channelFilter === 'SHOPIFY' && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-bold">
                🛍️ Shopify All Products ({pagination?.total ?? 0})
              </span>
            )}
            {channelFilter === 'EBAY' && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-950/80 border border-amber-800 text-amber-300 font-bold">
                🏷️ eBay All Products ({pagination?.total ?? 0})
              </span>
            )}
            {channelFilter === 'CUSTOM_STORE' && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-purple-950/80 border border-purple-800 text-purple-300 font-bold">
                🌐 Custom Website All Products ({pagination?.total ?? 0})
              </span>
            )}
            {channelFilter === 'ZERO_MAPPED' && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-red-950/80 border border-red-800 text-red-300 font-bold">
                🔗 0-Mapped Products ({pagination?.total ?? 0})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => handleSelectChannelFilter('ALL')}
            className="text-xs text-brand-400 hover:text-brand-300 font-semibold cursor-pointer underline"
          >
            Show All Master Products
          </button>
        </div>
      )}

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
                          {(pMappings.length || p.mappedCount || 0) === 0 ? (
                            <button
                              type="button"
                              onClick={() => openPushModal(p)}
                              className="bg-red-950/80 hover:bg-red-900/80 text-red-300 border border-red-800/80 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 cursor-pointer transition shadow-sm"
                              title="0 Mapped: Click to push and map this product to Shopify or eBay"
                            >
                              <Unlink className="w-3 h-3 text-red-400" />
                              <span>0 Mapped</span>
                            </button>
                          ) : (
                            <span className="bg-purple-950 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                              {pMappings.length || p.mappedCount || 0} mapped
                            </span>
                          )}
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
                            onClick={() => openPushModal(p)}
                            title="Push / Publish to Channels (Shopify, eBay)"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white rounded-lg border border-brand-500/30 transition text-[11px] font-semibold cursor-pointer"
                          >
                            <Share2 className="w-3.5 h-3.5" />
                            <span>Channels</span>
                          </button>

                          {/* Unmap from channels & delete from platform */}
                          <button
                            onClick={() => setProductToDelete(p)}
                            disabled={deleteMutation.isPending && deletingId === p._id}
                            title="Unmap from all channels (Shopify, eBay, Custom) and delete from platform"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white rounded-lg border border-red-500/20 hover:border-red-500 transition text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                          >
                            {deleteMutation.isPending && deletingId === p._id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            <span>Unmap & Delete</span>
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
                    {channelFilter === 'SHOPIFY' ? (
                      <div>
                        <span className="block text-slate-300 font-semibold mb-1">No products mapped to Shopify found.</span>
                        <span className="text-xs text-slate-500">Click &quot;Channels&quot; on any product in the catalog to push/publish it to Shopify, or reset the filter.</span>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleSelectChannelFilter('ALL')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer border border-slate-700"
                          >
                            Show All Products
                          </button>
                        </div>
                      </div>
                    ) : channelFilter === 'EBAY' ? (
                      <div>
                        <span className="block text-slate-300 font-semibold mb-1">No products mapped to eBay found.</span>
                        <span className="text-xs text-slate-500">Click &quot;Channels&quot; on any product in the catalog to push/publish it to eBay, or reset the filter.</span>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleSelectChannelFilter('ALL')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer border border-slate-700"
                          >
                            Show All Products
                          </button>
                        </div>
                      </div>
                    ) : channelFilter === 'CUSTOM_STORE' ? (
                      <div>
                        <span className="block text-slate-300 font-semibold mb-1">No products mapped to Custom Website found.</span>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => handleSelectChannelFilter('ALL')}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer border border-slate-700"
                          >
                            Show All Products
                          </button>
                        </div>
                      </div>
                    ) : (
                      <span>No canonical products found. Click &quot;Import from Channels&quot; above or create one!</span>
                    )}
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

      {/* MODAL 3: Push Product to Sales Channels Modal with Dynamic Platform Charges & Live Breakdown */}
      {pushModalProduct && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-brand-400" />
                  <span>Push Product to Sales Channels</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Select target storefronts. Store prices calculate dynamically by adding each platform&apos;s charges to our Base Price + Shipping.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeChannels.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={selectAllPushChannels}
                      className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 px-2.5 py-1 rounded-lg bg-brand-950/40 border border-brand-800/50 transition cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllPushChannels}
                      className="text-[11px] font-semibold text-slate-400 hover:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 transition cursor-pointer"
                    >
                      Clear All
                    </button>
                  </>
                )}
                <button
                  onClick={() => setPushModalProduct(null)}
                  className="text-slate-500 hover:text-white text-lg font-bold p-1 rounded-lg transition ml-2 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Selected Product Card */}
            {(() => {
              const basePrice = typeof pushModalProduct.defaultRetailPrice === 'number' && !isNaN(pushModalProduct.defaultRetailPrice) && pushModalProduct.defaultRetailPrice > 0
                ? pushModalProduct.defaultRetailPrice
                : (pushModalProduct.variants?.[0]?.retailPrice || 0);

              const baseShipping = typeof pushModalProduct.shippingCharge === 'number' && !isNaN(pushModalProduct.shippingCharge) && pushModalProduct.shippingCharge > 0
                ? pushModalProduct.shippingCharge
                : (pushModalProduct.variants?.[0]?.shippingCharge || 0);

              return (
                <div className="bg-slate-800/80 border border-slate-700/80 rounded-xl p-3.5 my-3 shrink-0">
                  <span className="text-[10px] text-brand-400 font-mono uppercase font-bold tracking-wider">
                    Selected Canonical Product (Master Base)
                  </span>
                  <div className="text-sm font-bold text-white mt-0.5">{pushModalProduct.title}</div>
                  <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300 font-mono">
                    <span>SKU: <strong className="text-white">{pushModalProduct.masterSku}</strong></span>
                    <span>&bull;</span>
                    <span>Platform Price: <strong className="text-emerald-400">{format(basePrice)}</strong></span>
                    <span>&bull;</span>
                    <span>Shipping: <strong className={baseShipping > 0 ? "text-cyan-400" : "text-slate-400"}>{baseShipping > 0 ? `+${format(baseShipping)}` : '€0.00 (Free)'}</strong></span>
                    <span>&bull;</span>
                    <span>Stock: <strong className="text-white">{pushModalProduct.totalStock ?? 0} units</strong></span>
                  </div>
                </div>
              );
            })()}

            {/* Channels Grid with Platform Charges and Price Breakdown */}
            <div className="overflow-y-auto pr-1 flex-1 py-1">
              {activeChannels.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                  {activeChannels.map((channel: any) => {
                    const chId = channel._id?._id || channel._id?.id || channel._id;
                    const isSelected = selectedPushChannelIds.includes(chId);
                    const badge = getChannelBadge(channel.channelType);
                    const channelMappings = getProductMappingsForChannel(pushModalProduct._id, chId);
                    const isAlreadyMapped = channelMappings.length > 0;

                    const basePrice = typeof pushModalProduct.defaultRetailPrice === 'number' && !isNaN(pushModalProduct.defaultRetailPrice) && pushModalProduct.defaultRetailPrice > 0
                      ? pushModalProduct.defaultRetailPrice
                      : (pushModalProduct.variants?.[0]?.retailPrice || 0);

                    const baseShipping = typeof pushModalProduct.shippingCharge === 'number' && !isNaN(pushModalProduct.shippingCharge) && pushModalProduct.shippingCharge > 0
                      ? pushModalProduct.shippingCharge
                      : (pushModalProduct.variants?.[0]?.shippingCharge || 0);

                    const feePercent = pushChannelMarkups[chId] !== undefined ? pushChannelMarkups[chId] : badge.defaultFee;
                    const combinedBasePrice = basePrice + (baseShipping || 0);
                    const feeAmount = (combinedBasePrice * feePercent) / 100;
                    const finalStorePrice = Math.round((combinedBasePrice + feeAmount) * 100) / 100;
                    const customInputVal = customPushMarkupInputs[chId] ?? '';

                    return (
                      <div
                        key={chId}
                        onClick={() => togglePushChannelSelection(chId)}
                        className={`rounded-2xl p-4 border transition select-none flex flex-col justify-between cursor-pointer ${
                          isSelected
                            ? `${badge.borderActive} shadow-lg border-2`
                            : 'bg-slate-800/40 border-slate-800 opacity-75 hover:opacity-100 hover:border-slate-700'
                        }`}
                      >
                        <div>
                          {/* Store Header */}
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xl">{badge.icon}</span>
                              <span className="font-bold text-slate-200 text-sm line-clamp-1">
                                {channel.name}
                              </span>
                            </div>
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition ${
                                isSelected
                                  ? 'bg-brand-600 border-brand-500 text-white'
                                  : 'bg-slate-800 border-slate-700 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </div>
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                              <span>Active</span>
                            </span>
                            {isAlreadyMapped && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-md ml-auto">
                                <Check className="w-2.5 h-2.5" />
                                <span>Already Mapped</span>
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-slate-400 font-mono mt-2 truncate">
                            {channel.config?.storeDomain ||
                              channel.config?.baseUrl ||
                              channel.name}
                          </div>

                          {/* PLATFORM CHARGES & FINAL PRICE CALCULATION BOX */}
                          <div
                            className="mt-3.5 p-3 bg-slate-900/90 border border-slate-800/90 rounded-xl space-y-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                                <Percent className="w-3 h-3 text-brand-400" />
                                <span>% Platform Charges</span>
                              </span>
                              <span className="font-mono font-bold text-brand-400">
                                +{feePercent}%
                              </span>
                            </div>

                            {/* Charges Presets (0%, 5%, 10%, 12%, 15%, Custom) */}
                            <div className="flex flex-wrap items-center gap-1">
                              {[0, 5, 10, 12, 15].map((preset) => {
                                const isCurrent = feePercent === preset && customInputVal === '';
                                return (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setPushChannelMarkups((prev) => ({ ...prev, [chId]: preset }));
                                      setCustomPushMarkupInputs((prev) => ({ ...prev, [chId]: '' }));
                                    }}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                                      isCurrent
                                        ? 'bg-brand-600 border-brand-500 text-white shadow-sm'
                                        : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'
                                    }`}
                                  >
                                    {preset}%
                                  </button>
                                );
                              })}

                              {/* Custom % input */}
                              <div className="flex items-center gap-1 ml-auto">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="0.5"
                                  placeholder="Custom"
                                  value={customInputVal}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setCustomPushMarkupInputs((prev) => ({ ...prev, [chId]: val }));
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed) && parsed >= 0) {
                                      setPushChannelMarkups((prev) => ({ ...prev, [chId]: parsed }));
                                    }
                                  }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 border border-slate-700 text-white placeholder-slate-500 outline-none focus:border-brand-500"
                                />
                                <span className="text-[10px] text-slate-400">%</span>
                              </div>
                            </div>

                            {/* Live Price Breakdown */}
                            <div className="pt-2 border-t border-slate-800/80 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Platform Price:</span>
                                <span className="font-mono text-slate-300">{format(basePrice)}</span>
                              </div>
                              {baseShipping > 0 ? (
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span className="text-cyan-400">+ Shipping Charge:</span>
                                  <span className="font-mono text-cyan-400">+{format(baseShipping)}</span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-between text-[10px] text-slate-500">
                                  <span>Shipping Charge:</span>
                                  <span className="font-mono text-slate-500">€0.00 (Free)</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Platform Fee (+{feePercent}%):</span>
                                <span className="font-mono text-amber-400">+{format(feeAmount)}</span>
                              </div>
                              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/60">
                                <span className="font-bold text-white">Final Store Price:</span>
                                <span className="font-mono font-extrabold text-emerald-400 text-sm">
                                  {format(finalStorePrice)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">Auto-Sync</span>
                          <span className={isSelected ? 'text-brand-400 font-semibold' : 'text-slate-500'}>
                            {isSelected ? 'Ready to Push' : 'Skip Channel'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
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

            {/* Modal Footer with Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 mt-2 border-t border-slate-800 shrink-0">
              <div className="text-xs text-slate-400">
                {selectedPushChannelIds.length > 0 ? (
                  <span>Ready to push to <strong className="text-white">{selectedPushChannelIds.length}</strong> channel storefront{selectedPushChannelIds.length > 1 ? 's' : ''}. Master Catalog prices remain safe and untouched.</span>
                ) : (
                  <span className="text-amber-400">Select at least one sales channel to push.</span>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={() => setPushModalProduct(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedPushChannelIds.length === 0) return;
                    publishMutation.mutate({
                      id: pushModalProduct._id,
                      channelConnectionIds: selectedPushChannelIds,
                      channelMarkups: pushChannelMarkups,
                      forceRepublish: true,
                    });
                  }}
                  disabled={selectedPushChannelIds.length === 0 || publishingId === pushModalProduct._id}
                  className="flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg bg-brand-600 hover:bg-brand-500 text-white shadow-brand-600/20 transition cursor-pointer disabled:opacity-50"
                >
                  {publishingId === pushModalProduct._id ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Pushing to Channels...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-4 h-4" />
                      <span>Push to Channels ({selectedPushChannelIds.length})</span>
                    </>
                  )}
                </button>
              </div>
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

      {/* MODAL 5: Export CSV Confirmation Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <Download className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => !isExporting && setIsExportModalOpen(false)}
                className="text-slate-500 hover:text-white text-lg font-bold p-1 rounded-lg transition"
                disabled={isExporting}
              >
                &times;
              </button>
            </div>

            <h3 className="text-base font-bold text-white mb-2">
              Export Products Catalog
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-4">
              Do you want to export your master product catalog? This will generate and download a comprehensive CSV spreadsheet with all product details, SKUs, prices, barcodes, and live inventory levels.
            </p>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-xs mb-5 space-y-2">
              <div className="flex items-center justify-between text-slate-400">
                <span>File Format:</span>
                <span className="text-white font-mono font-semibold">CSV (.csv spreadsheet)</span>
              </div>
              {pagination?.total !== undefined && (
                <div className="flex items-center justify-between text-slate-400">
                  <span>Total Master Products:</span>
                  <span className="text-brand-400 font-mono font-bold">{pagination.total}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-slate-400">
                <span>Included Fields:</span>
                <span className="text-slate-300">SKU, Title, Brand, Cost, Retail, Stock</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isExporting}
                className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50 flex items-center gap-2 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Unmap from Channels & Delete Product Confirmation Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-red-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-bold text-white">Unmap from Channels & Delete Product</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  This action unmaps and removes the product from all external stores, then permanently removes it from your platform catalog.
                </p>
              </div>
            </div>

            <div className="mt-4 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Product:</span>
                <span className="text-white font-semibold truncate max-w-[220px]">{productToDelete.title}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Master SKU:</span>
                <span className="text-slate-200 font-mono font-semibold">{productToDelete.masterSku}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-medium">Mapped Channels:</span>
                <span className="text-emerald-400 font-semibold">
                  {getProductMappings(productToDelete._id).length > 0
                    ? Array.from(new Set(getProductMappings(productToDelete._id).map((m: any) => m.channelType))).join(', ')
                    : '0 Mapped (Catalog Only)'}
                </span>
              </div>
            </div>

            {/* Store Deletion Option Checkbox */}
            <label className="mt-3 flex items-start gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:border-slate-700 transition">
              <input
                type="checkbox"
                checked={deleteFromStores}
                onChange={(e) => setDeleteFromStores(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-brand-600 focus:ring-0 focus:ring-offset-0 bg-slate-900"
              />
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-slate-200">
                  Also delete / end listings on external stores (eBay, Shopify)
                </span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  {deleteFromStores
                    ? '⚠️ Warning: Listings will be actively ended/deleted on eBay and Shopify stores.'
                    : 'Unchecked (Default): Unmaps and deletes product from this platform only, keeping your listings live and active on eBay and Shopify.'}
                </p>
              </div>
            </label>

            <div className="mt-3 p-3 bg-red-950/30 border border-red-500/20 rounded-xl text-[11px] text-red-300 flex items-start gap-2.5">
              <Info className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block text-red-200">Action Summary:</span>
                <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
                  <li>Product mappings are detached from our platform.</li>
                  {deleteFromStores ? (
                    <li className="text-red-300">Listing is deleted / ended on connected eBay and Shopify stores.</li>
                  ) : (
                    <li className="text-emerald-400">External store listings (eBay, Shopify) remain active and untouched.</li>
                  )}
                  <li>Product, variants, and stock records are deleted from our platform catalog.</li>
                </ol>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setProductToDelete(null);
                  setDeleteFromStores(false);
                }}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeletingId(productToDelete._id);
                  deleteMutation.mutate({ id: productToDelete._id, deleteFromStores });
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-red-600/30 transition cursor-pointer disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Unmapping & Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Unmap & Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: 0-Mapped & Channel Gap Master Modal */}
      <ZeroMappedModal
        isOpen={isZeroMappedModalOpen}
        initialFilter={zeroMappedInitialFilter}
        onClose={() => setIsZeroMappedModalOpen(false)}
        onSuccessNotification={(msg) => {
          setNotification({ type: 'success', text: msg });
          setTimeout(() => setNotification(null), 8000);
        }}
      />
    </div>
  );
}
