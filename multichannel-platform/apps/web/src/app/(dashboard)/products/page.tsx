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
} from 'lucide-react';

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showAlreadyImportedModal, setShowAlreadyImportedModal] = useState(false);
  const [alreadyImportedCount, setAlreadyImportedCount] = useState(0);

  const { data: productResponse, isLoading } = useQuery({
    queryKey: ['canonical-products', search, page, statusFilter],
    queryFn: async () => {
      let url = `/products?page=${page}&limit=15`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res: any = await api.get(url);
      return res;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/products/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
    },
  });

  // Push / Publish product to connected channels (Shopify)
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      setPublishingId(id);
      setNotification(null);
      const res: any = await api.post(`/products/${id}/publish`, {});
      return res.data;
    },
    onSuccess: (data: any) => {
      setPublishingId(null);
      const successResults = data.results?.filter((r: any) => r.status === 'SUCCESS') || [];
      if (successResults.length > 0) {
        setNotification({
          type: 'success',
          text: `Successfully pushed "${data.title}" to ${successResults.map((r: any) => r.channelName).join(', ')} and mapped listings!`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      setTimeout(() => setNotification(null), 6000);
    },
    onError: (err: any) => {
      setPublishingId(null);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to publish product to Shopify',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  // Import all products from Shopify into Master Catalog
  const importToCanonicalMutation = useMutation({
    mutationFn: async (vars?: { forceReimport?: boolean }) => {
      setIsImporting(true);
      setNotification(null);
      const res: any = await api.post('/sync/import-to-canonical', {
        forceReimport: vars?.forceReimport ?? false,
      });
      return res.data || res;
    },
    onSuccess: (data: any) => {
      setIsImporting(false);
      const info = data?.data || data;

      if (info?.alreadyImported) {
        setAlreadyImportedCount(info.alreadyImportedCount || 0);
        setShowAlreadyImportedModal(true);
        return;
      }

      setNotification({
        type: 'success',
        text: info?.message || `Successfully imported products from Shopify into your master catalog!`,
      });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      setTimeout(() => setNotification(null), 8000);
    },
    onError: (err: any) => {
      setIsImporting(false);
      setNotification({
        type: 'error',
        text: err.message || 'Failed to import products from Shopify',
      });
      setTimeout(() => setNotification(null), 8000);
    },
  });

  const products = productResponse?.data || [];
  const pagination = productResponse?.pagination;

  const handleExportCsv = () => {
    window.open('http://localhost:5050/api/v1/csv/export', '_blank');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Canonical Catalog</h1>
          <p className="text-xs text-slate-400 mt-1">
            Internal master catalog synchronized across Shopify and external storefronts
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => importToCanonicalMutation.mutate({ forceReimport: false })}
            disabled={isImporting}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition disabled:opacity-50 cursor-pointer"
            title="Import all products from your connected Shopify store into the master catalog"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isImporting ? 'animate-spin' : ''}`} />
            <span>{isImporting ? 'Importing from Shopify...' : 'Import from Shopify'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3.5 py-2.5 rounded-xl border border-slate-700 transition"
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
                products.map((p: any) => (
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
                      <span className="bg-purple-950 text-purple-400 border border-purple-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                        {p.mappedCount || 0} mapped
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-semibold text-white">
                      ${p.defaultRetailPrice?.toFixed(2)}
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
                        <button
                          onClick={() => publishMutation.mutate(p._id)}
                          disabled={publishingId === p._id}
                          title="Push & Publish to Shopify"
                          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-brand-600/20 hover:bg-brand-600 text-brand-300 hover:text-white rounded-lg border border-brand-500/30 transition disabled:opacity-50 text-[11px] font-semibold"
                        >
                          <UploadCloud className={`w-3.5 h-3.5 ${publishingId === p._id ? 'animate-bounce' : ''}`} />
                          <span>{publishingId === p._id ? 'Pushing...' : 'Push to Shopify'}</span>
                        </button>

                        <button
                          onClick={() => deleteMutation.mutate(p._id)}
                          title="Archive and Unmap"
                          className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    <Package className="w-8 h-8 mx-auto text-slate-700 mb-2" />
                    <span>No canonical products found. Click "Import from Shopify" above or create one!</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal when products are already imported */}
      {showAlreadyImportedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Products already imported</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Products from your Shopify store are already imported in your Master Catalog{alreadyImportedCount > 0 ? ` (${alreadyImportedCount} products)` : ''}.
                </p>
                <p className="text-xs text-amber-300/90 font-medium mt-2">
                  Do you want to import again?
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Re-importing will refresh and update all titles, descriptions, images, prices, and stock levels from Shopify.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowAlreadyImportedModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 border border-slate-700 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAlreadyImportedModal(false);
                  importToCanonicalMutation.mutate({ forceReimport: true });
                }}
                disabled={isImporting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition flex items-center gap-2 cursor-pointer"
              >
                {isImporting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Yes, Import Again</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
