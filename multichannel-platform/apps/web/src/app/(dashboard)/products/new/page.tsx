'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  ArrowLeft,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Share2,
  UploadCloud,
  Check,
  Store,
  Loader2,
  X,
  Layers,
  Boxes,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

export default function AddProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    title: 'Wireless Active Noise-Cancelling Headphones',
    masterSku: 'TECH-ANC-100',
    brand: 'AcoustiQ',
    category: 'Electronics / Audio',
    description: 'High-performance over-ear headphones with 40-hour battery life and fast charging.',
    defaultCostPrice: 45.0,
    defaultRetailPrice: 129.99,
  });

  const [variants, setVariants] = useState([
    {
      sku: 'TECH-ANC-100-BLK',
      barcode: '850012345678',
      title: 'Midnight Black',
      options: [{ name: 'Color', value: 'Black' }],
      costPrice: 45.0,
      retailPrice: 129.99,
      initialStock: 150,
    },
    {
      sku: 'TECH-ANC-100-SLV',
      barcode: '850012345679',
      title: 'Lunar Silver',
      options: [{ name: 'Color', value: 'Silver' }],
      costPrice: 45.0,
      retailPrice: 129.99,
      initialStock: 80,
    },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [isSubmittingOnly, setIsSubmittingOnly] = useState(false);

  // Fetch connected channels
  const { data: channels, isLoading: isLoadingChannels } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const res: any = await api.get('/channels');
      return res.data;
    },
  });

  const activeChannels = useMemo(() => {
    return (channels || []).filter((c: any) => c.status === 'ACTIVE');
  }, [channels]);

  // Selected channels state
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [channelsInitialized, setChannelsInitialized] = useState(false);
  const [isChannelModalOpen, setIsChannelModalOpen] = useState(false);

  // Progress dialog state during multi-channel push
  const [pushProgress, setPushProgress] = useState<{
    isOpen: boolean;
    stage: 'creating' | 'pushing' | 'completed' | 'error';
    createdProduct?: any;
    results: Array<{
      channelId: string;
      channelName: string;
      channelType: string;
      status: 'pending' | 'in_progress' | 'success' | 'failed';
      message?: string;
    }>;
    errorText?: string;
  } | null>(null);

  // Pre-select active channels once loaded
  useEffect(() => {
    if (activeChannels.length > 0 && !channelsInitialized) {
      setSelectedChannelIds(
        activeChannels.map((c: any) => c._id?._id || c._id?.id || c._id)
      );
      setChannelsInitialized(true);
    }
  }, [activeChannels, channelsInitialized]);

  const toggleChannelSelection = (id: string) => {
    setSelectedChannelIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const selectAllChannels = () => {
    setSelectedChannelIds(
      activeChannels.map((c: any) => c._id?._id || c._id?.id || c._id)
    );
  };

  const deselectAllChannels = () => {
    setSelectedChannelIds([]);
  };

  const addVariant = () => {
    setVariants([
      ...variants,
      {
        sku: `${formData.masterSku}-VAR-${variants.length + 1}`,
        barcode: '',
        title: `Variant ${variants.length + 1}`,
        options: [{ name: 'Option', value: 'Default' }],
        costPrice: formData.defaultCostPrice,
        retailPrice: formData.defaultRetailPrice,
        initialStock: 25,
      },
    ]);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 1) return;
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: string, val: any) => {
    const updated = [...variants];
    (updated[index] as any)[field] = val;
    setVariants(updated);
  };

  const getChannelBadge = (type: string) => {
    switch (type?.toUpperCase()) {
      case 'SHOPIFY':
        return {
          label: 'Shopify',
          icon: '🛍️',
          bg: 'bg-emerald-950/80 text-emerald-400 border-emerald-800/80',
          borderActive: 'border-emerald-500 bg-emerald-950/20 shadow-emerald-500/10',
        };
      case 'EBAY':
        return {
          label: 'eBay',
          icon: '🏷️',
          bg: 'bg-amber-950/80 text-amber-400 border-amber-800/80',
          borderActive: 'border-amber-500 bg-amber-950/20 shadow-amber-500/10',
        };
      case 'AMAZON':
        return {
          label: 'Amazon',
          icon: '📦',
          bg: 'bg-yellow-950/80 text-yellow-400 border-yellow-800/80',
          borderActive: 'border-yellow-500 bg-yellow-950/20 shadow-yellow-500/10',
        };
      default:
        return {
          label: type || 'Sales Channel',
          icon: '🌐',
          bg: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
          borderActive: 'border-purple-500 bg-purple-950/20 shadow-purple-500/10',
        };
    }
  };

  const validateForm = () => {
    if (!formData.title?.trim()) {
      setError('Product Title is required.');
      return false;
    }
    if (!formData.masterSku?.trim()) {
      setError('Master SKU is required.');
      return false;
    }
    if (!variants || variants.length === 0) {
      setError('At least one product variant is required.');
      return false;
    }
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.sku?.trim()) {
        setError(`Variant ${i + 1} (${v.title || 'Untitled'}) must have a valid SKU.`);
        return false;
      }
      if (typeof v.retailPrice !== 'number' || isNaN(v.retailPrice) || v.retailPrice < 0) {
        setError(`Variant ${i + 1} (${v.sku}) must have a valid Retail Price.`);
        return false;
      }
    }
    setError(null);
    return true;
  };

  // Create Master Product Only (without publishing to channels)
  const handleCreateOnly = async () => {
    if (!validateForm()) return;
    try {
      setIsSubmittingOnly(true);
      const payload = { ...formData, variants };
      await api.post('/products', payload);
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      router.push('/products');
    } catch (err: any) {
      setIsSubmittingOnly(false);
      setError(err.message || 'Failed to create master product');
    }
  };

  // Push to Selected Channels Flow
  const handlePushToChannels = async (targetChannelIds: string[]) => {
    if (!validateForm()) return;

    if (targetChannelIds.length === 0) {
      setIsChannelModalOpen(true);
      return;
    }

    setIsChannelModalOpen(false);

    const targetChannels = activeChannels.filter((c: any) => {
      const chId = c._id?._id || c._id?.id || c._id;
      return targetChannelIds.includes(chId);
    });

    const initialSteps = targetChannels.map((c: any) => {
      const chId = c._id?._id || c._id?.id || c._id;
      return {
        channelId: chId,
        channelName: c.name,
        channelType: c.channelType,
        status: 'pending' as const,
        message: 'Waiting in queue...',
      };
    });

    setPushProgress({
      isOpen: true,
      stage: 'creating',
      results: initialSteps,
    });

    try {
      // Step 1: Create Canonical Product & Variants
      const payload = { ...formData, variants };
      const createRes: any = await api.post('/products', payload);
      const created = createRes.data;

      setPushProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: 'pushing',
              createdProduct: created,
            }
          : null
      );

      // Step 2: Push to each selected channel sequentially
      const updatedResults = [...initialSteps];

      for (let i = 0; i < targetChannels.length; i++) {
        const ch = targetChannels[i];
        const chId = ch._id?._id || ch._id?.id || ch._id;

        updatedResults[i] = {
          ...updatedResults[i],
          status: 'in_progress',
          message: `Pushing variants and stock to ${ch.name}...`,
        };
        setPushProgress((prev) => (prev ? { ...prev, results: [...updatedResults] } : null));

        try {
          const pubRes: any = await api.post(`/products/${created._id}/publish`, {
            channelConnectionId: chId,
            forceRepublish: true,
          });

          updatedResults[i] = {
            ...updatedResults[i],
            status: 'success',
            message:
              pubRes?.data?.message ||
              pubRes?.message ||
              `Listing active and synchronized on ${ch.name}!`,
          };
        } catch (pubErr: any) {
          console.error(`Error publishing to channel ${ch.name}:`, pubErr);
          updatedResults[i] = {
            ...updatedResults[i],
            status: 'failed',
            message:
              pubErr?.response?.data?.error?.message ||
              pubErr?.message ||
              'Failed to push to this channel',
          };
        }

        setPushProgress((prev) => (prev ? { ...prev, results: [...updatedResults] } : null));
      }

      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });

      const anySuccess = updatedResults.some((r) => r.status === 'success');
      setPushProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: anySuccess ? 'completed' : 'error',
              results: updatedResults,
            }
          : null
      );

      // If all succeeded, auto-redirect after 2.5s
      if (updatedResults.every((r) => r.status === 'success')) {
        setTimeout(() => {
          router.push('/products');
        }, 2500);
      }
    } catch (err: any) {
      console.error('Failed to create and push product:', err);
      setPushProgress((prev) =>
        prev
          ? {
              ...prev,
              stage: 'error',
              errorText: err.message || 'Failed to create master canonical product',
            }
          : null
      );
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedChannelIds.length > 0) {
      handlePushToChannels(selectedChannelIds);
    } else {
      setIsChannelModalOpen(true);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/products"
            className="p-2 bg-slate-900 border border-slate-800 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Create Canonical Product</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Defines internal master specifications and multi-channel variants
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 flex items-center gap-3 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Product Core Attributes
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300">Product Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Master SKU *</label>
              <input
                type="text"
                required
                value={formData.masterSku}
                onChange={(e) => setFormData({ ...formData, masterSku: e.target.value.toUpperCase() })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-brand-500 outline-none uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-300">Description</label>
              <textarea
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Variants Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                Product Variants & Initial Stock
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Each variant maintains isolated inventory, barcodes, and pricing
              </p>
            </div>

            <button
              type="button"
              onClick={addVariant}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Variant</span>
            </button>
          </div>

          <div className="space-y-3">
            {variants.map((v, idx) => (
              <div
                key={idx}
                className="bg-slate-800/50 border border-slate-800 rounded-xl p-4 grid grid-cols-1 md:grid-cols-6 gap-3 items-center"
              >
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                    Variant Title
                  </label>
                  <input
                    type="text"
                    required
                    value={v.title}
                    onChange={(e) => updateVariant(idx, 'title', e.target.value)}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                    SKU *
                  </label>
                  <input
                    type="text"
                    required
                    value={v.sku}
                    onChange={(e) => updateVariant(idx, 'sku', e.target.value.toUpperCase())}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                    Retail Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={v.retailPrice}
                    onChange={(e) => updateVariant(idx, 'retailPrice', parseFloat(e.target.value))}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                    Initial Stock
                  </label>
                  <input
                    type="number"
                    required
                    value={v.initialStock}
                    onChange={(e) => updateVariant(idx, 'initialStock', parseInt(e.target.value, 10))}
                    className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none"
                  />
                </div>

                <div className="flex items-end justify-end">
                  <button
                    type="button"
                    disabled={variants.length <= 1}
                    onClick={() => removeVariant(idx)}
                    className="p-2 text-slate-400 hover:text-red-400 disabled:opacity-30 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Multi-Channel Publishing Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-brand-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Push Directly to Sales Channels
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Select the connected storefronts where this product, its variants, and stock should be published upon creation.
              </p>
            </div>

            {activeChannels.length > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={selectAllChannels}
                  className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 px-2.5 py-1 rounded-lg bg-brand-950/40 border border-brand-800/50 transition cursor-pointer"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAllChannels}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-300 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 transition cursor-pointer"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => setIsChannelModalOpen(true)}
                  className="text-[11px] font-semibold text-slate-200 hover:text-white px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Store className="w-3.5 h-3.5 text-brand-400" />
                  <span>Manage Channels</span>
                </button>
              </div>
            )}
          </div>

          {isLoadingChannels ? (
            <div className="p-8 flex items-center justify-center gap-2 text-slate-400 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-brand-400" />
              <span>Loading connected channel stores...</span>
            </div>
          ) : activeChannels.length === 0 ? (
            <div className="bg-slate-800/40 border border-slate-800 rounded-xl p-5 text-center">
              <Store className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-300">No Active Channels Connected</div>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                You can save this product to your Master Catalog now, or connect Shopify or eBay to publish in real-time.
              </p>
              <Link
                href="/channels"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-400 hover:text-brand-300 mt-3"
              >
                <span>Go to Channel Integrations</span>
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {activeChannels.map((channel: any) => {
                const chId = channel._id?._id || channel._id?.id || channel._id;
                const isSelected = selectedChannelIds.includes(chId);
                const badge = getChannelBadge(channel.channelType);

                return (
                  <div
                    key={chId}
                    onClick={() => toggleChannelSelection(chId)}
                    className={`cursor-pointer rounded-xl p-4 border transition select-none flex flex-col justify-between ${
                      isSelected
                        ? `${badge.borderActive} shadow-lg border-2`
                        : 'bg-slate-800/40 border-slate-800 opacity-75 hover:opacity-100 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{badge.icon}</span>
                          <span className="font-bold text-slate-200 text-xs line-clamp-1">
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
                      </div>

                      <div className="text-[11px] text-slate-400 font-mono mt-2 truncate">
                        {channel.config?.storeDomain ||
                          channel.config?.baseUrl ||
                          channel.name}
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
          )}
        </div>

        {/* Submit Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <Link
            href="/products"
            className="px-5 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </Link>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* Secondary: Save Master Product Only */}
            <button
              type="button"
              onClick={handleCreateOnly}
              disabled={isSubmittingOnly}
              className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
            >
              {isSubmittingOnly ? 'Saving...' : 'Save Master Product Only'}
            </button>

            {/* Primary: Push to Channels Button */}
            <button
              type="button"
              onClick={() => {
                if (selectedChannelIds.length > 0) {
                  handlePushToChannels(selectedChannelIds);
                } else {
                  setIsChannelModalOpen(true);
                }
              }}
              className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition flex items-center gap-2 cursor-pointer"
            >
              <UploadCloud className="w-4 h-4" />
              <span>
                {selectedChannelIds.length > 0
                  ? `Push to Channels (${selectedChannelIds.length})`
                  : 'Push to Channels...'}
              </span>
            </button>
          </div>
        </div>
      </form>

      {/* Channel Selection Modal */}
      {isChannelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Share2 className="w-5 h-5 text-brand-400" />
                  <span>Select Channels to Push</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Choose which connected channel storefronts should receive this product.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsChannelModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Summary */}
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-xs space-y-1">
              <div className="font-semibold text-white text-sm">{formData.title || 'Untitled Product'}</div>
              <div className="flex items-center gap-3 text-slate-400 font-mono">
                <span>SKU: <strong className="text-white">{formData.masterSku}</strong></span>
                <span>&bull;</span>
                <span>{variants.length} Variant(s)</span>
                <span>&bull;</span>
                <span>Retail: <strong className="text-emerald-400">${formData.defaultRetailPrice?.toFixed(2)}</strong></span>
              </div>
            </div>

            {/* Channels Checklist */}
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {activeChannels.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  No active channels found. Connect stores in Channel Integrations.
                </div>
              ) : (
                activeChannels.map((channel: any) => {
                  const chId = channel._id?._id || channel._id?.id || channel._id;
                  const isSelected = selectedChannelIds.includes(chId);
                  const badge = getChannelBadge(channel.channelType);

                  return (
                    <div
                      key={chId}
                      onClick={() => toggleChannelSelection(chId)}
                      className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                        isSelected
                          ? `${badge.borderActive} border-2`
                          : 'bg-slate-800/40 border-slate-700/60 hover:bg-slate-800/70'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{badge.icon}</span>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-xs">{channel.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono mt-0.5 block">
                            {channel.config?.storeDomain || channel.name}
                          </span>
                        </div>
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
                  );
                })
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllChannels}
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                >
                  Select All
                </button>
                <span className="text-slate-600">&bull;</span>
                <button
                  type="button"
                  onClick={deselectAllChannels}
                  className="text-xs text-slate-400 hover:text-slate-300 font-medium"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChannelModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedChannelIds.length === 0}
                  onClick={() => handlePushToChannels(selectedChannelIds)}
                  className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white text-xs font-bold px-5 py-2 rounded-xl shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Push to {selectedChannelIds.length} Channel(s)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Multi-Channel Publishing Progress Modal */}
      {pushProgress?.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-scale-up">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-brand-950/60 border border-brand-800/80 flex items-center justify-center mx-auto text-brand-400">
                {pushProgress.stage === 'completed' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : pushProgress.stage === 'error' ? (
                  <AlertCircle className="w-6 h-6 text-red-400" />
                ) : (
                  <UploadCloud className="w-6 h-6 animate-bounce text-brand-400" />
                )}
              </div>
              <h3 className="text-lg font-bold text-white">
                {pushProgress.stage === 'creating'
                  ? 'Initializing Master Product...'
                  : pushProgress.stage === 'pushing'
                  ? 'Pushing to Selected Channels...'
                  : pushProgress.stage === 'completed'
                  ? 'Published Successfully!'
                  : 'Publishing Finished with Notices'}
              </h3>
              <p className="text-xs text-slate-400">
                {formData.title} ({formData.masterSku})
              </p>
            </div>

            {/* Steps & Results List */}
            <div className="space-y-3 bg-slate-800/40 border border-slate-800 rounded-xl p-4">
              {/* Step 0: Canonical Product Creation */}
              <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                <span className="text-slate-300 font-medium">Canonical Catalog & Stock Creation</span>
                {pushProgress.stage === 'creating' ? (
                  <span className="text-brand-400 flex items-center gap-1 font-mono">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...
                  </span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                    <Check className="w-3.5 h-3.5" /> Created
                  </span>
                )}
              </div>

              {/* Per-Channel Status */}
              {pushProgress.results.map((res) => {
                const badge = getChannelBadge(res.channelType);
                return (
                  <div key={res.channelId} className="space-y-1 text-xs pt-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{badge.icon}</span>
                        <span className="font-semibold text-slate-200">{res.channelName}</span>
                        <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${badge.bg}`}>
                          {badge.label}
                        </span>
                      </div>

                      {res.status === 'pending' && (
                        <span className="text-slate-500 font-mono text-[11px]">Queued</span>
                      )}
                      {res.status === 'in_progress' && (
                        <span className="text-brand-400 flex items-center gap-1 font-mono text-[11px]">
                          <Loader2 className="w-3 h-3 animate-spin" /> Pushing...
                        </span>
                      )}
                      {res.status === 'success' && (
                        <span className="text-emerald-400 flex items-center gap-1 font-bold text-[11px]">
                          <Check className="w-3.5 h-3.5" /> Pushed
                        </span>
                      )}
                      {res.status === 'failed' && (
                        <span className="text-red-400 flex items-center gap-1 font-bold text-[11px]">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      )}
                    </div>
                    {res.message && (
                      <div className="text-[11px] text-slate-400 pl-6 truncate">
                        {res.message}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {pushProgress.errorText && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{pushProgress.errorText}</span>
              </div>
            )}

            {/* Completion Buttons */}
            {(pushProgress.stage === 'completed' || pushProgress.stage === 'error') && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPushProgress(null);
                    router.push('/products');
                  }}
                  className="w-full bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg transition cursor-pointer"
                >
                  View in All Products
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
