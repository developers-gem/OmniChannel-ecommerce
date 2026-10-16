'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function AddProductPage() {
  const router = useRouter();
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
  const [publishImmediately, setPublishImmediately] = useState(true);

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

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        variants,
      };
      const res: any = await api.post('/products', payload);
      const created = res.data;

      if (publishImmediately && created?._id) {
        try {
          await api.post(`/products/${created._id}/publish`, {});
        } catch (pubErr: any) {
          console.warn('Could not auto-publish to store:', pubErr);
        }
      }
      return created;
    },
    onSuccess: () => {
      router.push('/products');
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create product');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    createMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
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

        {/* Channel Publishing Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="text-base">🛍️</span>
              <span>Publish Directly to Connected Shopify Store</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Automatically creates this product on your live Shopify store, uploads variants with initial stock, and links them for real-time synchronization.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
            <input
              type="checkbox"
              checked={publishImmediately}
              onChange={(e) => setPublishImmediately(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
          </label>
        </div>

        {/* Submit */}
        <div className="flex items-center justify-end gap-4">
          <Link
            href="/products"
            className="px-5 py-2.5 text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
          >
            {createMutation.isPending
              ? 'Creating & Publishing...'
              : publishImmediately
              ? 'Create & Publish to Shopify'
              : 'Save & Initialize Inventory'}
          </button>
        </div>
      </form>
    </div>
  );
}
