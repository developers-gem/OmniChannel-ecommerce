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
  Percent,
  Calculator,
} from 'lucide-react';
import { useCurrency } from '@/lib/currency';

export default function AddProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { symbol, format } = useCurrency();

  const [formData, setFormData] = useState({
    title: 'Wireless Active Noise-Cancelling Headphones',
    masterSku: 'TECH-ANC-100',
    brand: 'AcoustiQ',
    category: 'Electronics / Audio',
    description: 'High-performance over-ear headphones with 40-hour battery life and fast charging.',
    defaultCostPrice: 45.0,
    defaultRetailPrice: 129.99,
    defaultInitialStock: 100,
  });

  const [variants, setVariants] = useState<Array<{
    sku: string;
    barcode?: string;
    title: string;
    options: Array<{ name: string; value: string }>;
    costPrice: number;
    retailPrice: number;
    initialStock: number;
  }>>([
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

  // Platform charges / markups per channel
  const [channelMarkups, setChannelMarkups] = useState<Record<string, number>>({});
  const [customMarkupInputs, setCustomMarkupInputs] = useState<Record<string, string>>({});

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

  // Pre-select active channels & set default platform charges (Shopify=5%, eBay=15%, Amazon=15%, default=10%)
  useEffect(() => {
    if (activeChannels.length > 0 && !channelsInitialized) {
      setSelectedChannelIds(
        activeChannels.map((c: any) => c._id?._id || c._id?.id || c._id)
      );

      setChannelMarkups((prev) => {
        const next = { ...prev };
        for (const ch of activeChannels) {
          const chId = ch._id?._id || ch._id?.id || ch._id;
          if (next[chId] === undefined) {
            const type = (ch.channelType || '').toUpperCase();
            if (type === 'SHOPIFY') next[chId] = 5;
            else if (type === 'EBAY') next[chId] = 15;
            else if (type === 'AMAZON') next[chId] = 15;
            else next[chId] = 10;
          }
        }
        return next;
      });

      setChannelsInitialized(true);
    }
  }, [activeChannels, channelsInitialized]);

  // Base platform retail price used for calculations
  const basePlatformPrice = useMemo(() => {
    if (variants.length > 0) {
      const firstPrice = variants[0]?.retailPrice;
      if (typeof firstPrice === 'number' && !isNaN(firstPrice) && firstPrice >= 0) {
        return firstPrice;
      }
    }
    return typeof formData.defaultRetailPrice === 'number' && !isNaN(formData.defaultRetailPrice)
      ? formData.defaultRetailPrice
      : 0;
  }, [variants, formData.defaultRetailPrice]);

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
    const nextIdx = variants.length + 1;
    setVariants((prev) => [
      ...prev,
      {
        sku: `${formData.masterSku || 'SKU'}-VAR-${nextIdx}`,
        barcode: '',
        title: `Variant ${nextIdx}`,
        options: [{ name: 'Option', value: 'Default' }],
        costPrice: formData.defaultCostPrice || 0,
        retailPrice: formData.defaultRetailPrice || 0,
        initialStock: formData.defaultInitialStock || 50,
      },
    ]);
  };

  // Remove individual variant (allows deleting all variants)
  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  };

  // Clear all variants (switches product to Simple Product mode)
  const removeAllVariants = () => {
    setVariants([]);
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
          label: type || 'Sales Channel',
          icon: '🌐',
          bg: 'bg-purple-950/80 text-purple-400 border-purple-800/80',
          borderActive: 'border-purple-500 bg-purple-950/20 shadow-purple-500/10',
          defaultFee: 10,
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

    if (variants.length === 0) {
      if (
        typeof formData.defaultRetailPrice !== 'number' ||
        isNaN(formData.defaultRetailPrice) ||
        formData.defaultRetailPrice < 0
      ) {
        setError('Please enter a valid Platform Retail Price (cannot be negative).');
        return false;
      }
      if (
        typeof formData.defaultInitialStock !== 'number' ||
        isNaN(formData.defaultInitialStock) ||
        formData.defaultInitialStock < 0
      ) {
        setError('Please enter a valid Initial Stock Quantity (0 or higher).');
        return false;
      }
    } else {
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
    }

    setError(null);
    return true;
  };

  // Create Master Product Only (without publishing to channels)
  const handleCreateOnly = async () => {
    if (!validateForm()) return;
    try {
      setIsSubmittingOnly(true);
      const cleanVariants = variants.map((v) => ({
        ...v,
        retailPrice: typeof v.retailPrice === 'number' && !isNaN(v.retailPrice) && v.retailPrice >= 0 ? v.retailPrice : 0,
        costPrice: typeof v.costPrice === 'number' && !isNaN(v.costPrice) && v.costPrice >= 0 ? v.costPrice : 0,
        initialStock: typeof v.initialStock === 'number' && !isNaN(v.initialStock) && v.initialStock >= 0 ? Math.floor(v.initialStock) : 0,
      }));
      const payload = {
        ...formData,
        defaultInitialStock: Math.floor(formData.defaultInitialStock || 0),
        variants: cleanVariants,
      };
      await api.post('/products', payload);
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      router.push('/products');
    } catch (err: any) {
      setIsSubmittingOnly(false);
      setError(err?.response?.data?.error?.message || err.message || 'Failed to create master product');
    }
  };

  // Push to Selected Channels Flow with Channel-specific Platform Charges
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
      const cleanVariants = variants.map((v) => ({
        ...v,
        retailPrice: typeof v.retailPrice === 'number' && !isNaN(v.retailPrice) && v.retailPrice >= 0 ? v.retailPrice : 0,
        costPrice: typeof v.costPrice === 'number' && !isNaN(v.costPrice) && v.costPrice >= 0 ? v.costPrice : 0,
        initialStock: typeof v.initialStock === 'number' && !isNaN(v.initialStock) && v.initialStock >= 0 ? Math.floor(v.initialStock) : 0,
      }));
      const payload = {
        ...formData,
        defaultInitialStock: Math.floor(formData.defaultInitialStock || 0),
        variants: cleanVariants,
      };
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

      // Step 2: Push to each selected channel sequentially with platform markup
      const updatedResults = [...initialSteps];

      for (let i = 0; i < targetChannels.length; i++) {
        const ch = targetChannels[i];
        const chId = ch._id?._id || ch._id?.id || ch._id;
        const badge = getChannelBadge(ch.channelType);
        const feePercent = channelMarkups[chId] !== undefined ? channelMarkups[chId] : badge.defaultFee;

        updatedResults[i] = {
          ...updatedResults[i],
          status: 'in_progress',
          message: `Pushing to ${ch.name} with ${feePercent}% platform charges...`,
        };
        setPushProgress((prev) => (prev ? { ...prev, results: [...updatedResults] } : null));

        try {
          const pubRes: any = await api.post(`/products/${created._id}/publish`, {
            channelConnectionId: chId,
            forceRepublish: true,
            markupPercent: feePercent,
            channelMarkups: { [chId]: feePercent },
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
              errorText: err?.response?.data?.error?.message || err.message || 'Failed to create master canonical product',
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
              Defines internal master specifications, platform pricing, and multi-channel publication
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
        {/* PRODUCT CORE ATTRIBUTES */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Product Core Attributes
            </h2>
            {variants.length === 0 ? (
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Simple Product (No Variants)</span>
              </span>
            ) : (
              <span className="text-[11px] font-semibold text-brand-400 bg-brand-950/60 border border-brand-800/60 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" />
                <span>{variants.length} Variant(s) Active</span>
              </span>
            )}
          </div>

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

            {/* DYNAMIC: When user deletes all variants, display Platform Price & Stock right here */}
            {variants.length === 0 ? (
              <div className="md:col-span-2 mt-2 pt-4 border-t border-slate-800">
                <div className="bg-gradient-to-r from-brand-950/40 to-slate-800/40 border border-brand-800/50 rounded-xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-brand-300 font-bold text-xs uppercase tracking-wider">
                      <Sparkles className="w-4 h-4 text-brand-400" />
                      <span>Platform Retail Price & Initial Stock (Master Base)</span>
                    </div>
                    <span className="text-[11px] text-brand-400 font-mono bg-brand-950/60 border border-brand-700/50 px-2 py-0.5 rounded-md self-start sm:self-auto">
                      Our Platform Price
                    </span>
                  </div>

                  <p className="text-xs text-slate-400">
                    All product variants have been removed. Configure our internal platform price and initial warehouse stock here. Store prices on Shopify or eBay will calculate automatically based on platform charges.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-200">
                        Platform Retail Price ({symbol}) *
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={isNaN(formData.defaultRetailPrice) ? '' : formData.defaultRetailPrice}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setFormData({ ...formData, defaultRetailPrice: isNaN(val) ? 0 : val });
                        }}
                        placeholder="0.00"
                        className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-brand-600/50 text-white text-xs font-mono font-bold focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Our platform catalog base price
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-200">
                        Initial Stock Quantity *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={isNaN(formData.defaultInitialStock) ? '' : formData.defaultInitialStock}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          setFormData({ ...formData, defaultInitialStock: isNaN(val) ? 0 : Math.max(0, val) });
                        }}
                        placeholder="0"
                        className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Available warehouse quantity
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-200">
                        Unit Cost Price ({symbol})
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={isNaN(formData.defaultCostPrice) ? '' : formData.defaultCostPrice}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setFormData({ ...formData, defaultCostPrice: isNaN(val) ? 0 : val });
                        }}
                        placeholder="0.00"
                        className="mt-1 w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        COGS / Supplier cost
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="md:col-span-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl bg-slate-800/40 border border-slate-800 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-brand-400 shrink-0" />
                  <span>
                    Price and stock are managed per variant below ({variants.length} variant{variants.length > 1 ? 's' : ''}).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={removeAllVariants}
                  className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold underline cursor-pointer shrink-0"
                >
                  Delete all variants to set price & stock here
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PRODUCT VARIANTS & INITIAL STOCK */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
                Product Variants & Initial Stock
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {variants.length === 0
                  ? 'No variants active. This product will be created as a Simple Product.'
                  : 'Each variant maintains isolated inventory, barcodes, and platform pricing'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {variants.length > 0 && (
                <button
                  type="button"
                  onClick={removeAllVariants}
                  className="flex items-center gap-1.5 bg-red-950/40 hover:bg-red-950/80 text-red-400 hover:text-red-300 text-xs font-semibold px-3 py-1.5 rounded-xl border border-red-800/60 transition cursor-pointer"
                  title="Remove all variants and configure price & stock directly in Product Core Attributes"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete All Variants</span>
                </button>
              )}

              <button
                type="button"
                onClick={addVariant}
                className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Variant</span>
              </button>
            </div>
          </div>

          {variants.length === 0 ? (
            <div className="bg-slate-800/30 border border-dashed border-slate-700/80 rounded-xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-950/50 border border-amber-800/60 flex items-center justify-center mx-auto text-amber-400">
                <Boxes className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="text-sm font-bold text-white">
                  Simple Product Mode Active (0 Variants)
                </div>
                <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
                  All variants have been deleted. This item will be created as a standalone product using our Platform Price{' '}
                  <strong className="text-emerald-400 font-mono font-bold">
                    {format(formData.defaultRetailPrice)}
                  </strong>{' '}
                  and warehouse stock of{' '}
                  <strong className="text-white font-mono font-bold">
                    {formData.defaultInitialStock} units
                  </strong>{' '}
                  configured in Product Core Attributes above.
                </p>
              </div>
              <button
                type="button"
                onClick={addVariant}
                className="inline-flex items-center gap-2 text-xs font-semibold text-brand-400 hover:text-brand-300 bg-brand-950/40 border border-brand-800/60 px-4 py-2 rounded-xl transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add a Variant (e.g., Color, Size)</span>
              </button>
            </div>
          ) : (
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
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:ring-1 focus:ring-brand-500"
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
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none uppercase focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                      Platform Price ({symbol})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={isNaN(v.retailPrice) ? '' : v.retailPrice}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateVariant(idx, 'retailPrice', isNaN(val) ? 0 : val);
                      }}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                      Initial Stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={isNaN(v.initialStock) ? '' : v.initialStock}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        updateVariant(idx, 'initialStock', isNaN(val) ? 0 : Math.max(0, val));
                      }}
                      className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>

                  <div className="flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => removeVariant(idx)}
                      className="p-2 text-slate-400 hover:text-red-400 transition cursor-pointer rounded-lg hover:bg-slate-700/50"
                      title="Delete this variant"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PUSH DIRECTLY TO SALES CHANNELS WITH PLATFORM CHARGES CALCULATION */}
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
                Select target storefronts. Store prices calculate dynamically by adding each platform&apos;s charges to our Platform Price ({format(basePlatformPrice)}).
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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {activeChannels.map((channel: any) => {
                const chId = channel._id?._id || channel._id?.id || channel._id;
                const isSelected = selectedChannelIds.includes(chId);
                const badge = getChannelBadge(channel.channelType);

                // Fee & Price calculation
                const feePercent = channelMarkups[chId] !== undefined ? channelMarkups[chId] : badge.defaultFee;
                const feeAmount = (basePlatformPrice * feePercent) / 100;
                const finalStorePrice = Math.round((basePlatformPrice + feeAmount) * 100) / 100;
                const customInputVal = customMarkupInputs[chId] ?? '';

                return (
                  <div
                    key={chId}
                    onClick={() => toggleChannelSelection(chId)}
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

                      {/* PLATFORM CHARGES & FINAL PRICE CALCULATION BOX */}
                      <div
                        className="mt-3.5 p-3 bg-slate-900/90 border border-slate-800/90 rounded-xl space-y-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-slate-300 uppercase tracking-wider text-[10px] flex items-center gap-1">
                            <Percent className="w-3 h-3 text-brand-400" />
                            <span>Platform Charges</span>
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
                                  setChannelMarkups((prev) => ({ ...prev, [chId]: preset }));
                                  setCustomMarkupInputs((prev) => ({ ...prev, [chId]: '' }));
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
                                setCustomMarkupInputs((prev) => ({ ...prev, [chId]: val }));
                                const parsed = parseFloat(val);
                                if (!isNaN(parsed) && parsed >= 0) {
                                  setChannelMarkups((prev) => ({ ...prev, [chId]: parsed }));
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
                            <span className="font-mono text-slate-300">{format(basePlatformPrice)}</span>
                          </div>
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
                <span>{variants.length === 0 ? 'Simple Product (0 Variants)' : `${variants.length} Variant(s)`}</span>
                <span>&bull;</span>
                <span>Platform Price: <strong className="text-emerald-400">{format(basePlatformPrice)}</strong></span>
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
                  const feePercent = channelMarkups[chId] !== undefined ? channelMarkups[chId] : badge.defaultFee;
                  const finalPrice = Math.round((basePlatformPrice * (1 + feePercent / 100)) * 100) / 100;

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
                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                            <span>{channel.config?.storeDomain || channel.name}</span>
                            <span>&bull;</span>
                            <span className="text-amber-400 font-semibold">+{feePercent}% charge</span>
                            <span>&bull;</span>
                            <span className="text-emerald-400 font-bold">Store Price: {format(finalPrice)}</span>
                          </div>
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
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-600">&bull;</span>
                <button
                  type="button"
                  onClick={deselectAllChannels}
                  className="text-xs text-slate-400 hover:text-slate-300 font-medium cursor-pointer"
                >
                  Clear
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsChannelModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white cursor-pointer"
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
