'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Share2,
  Plus,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Globe,
  ShoppingBag,
  ExternalLink,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import { ChannelType, ChannelStatus } from '@multichannel/shared';

export default function ChannelsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ChannelType>(ChannelType.SHOPIFY);
  const [storeName, setStoreName] = useState('');
  const [storeDomain, setStoreDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [modalError, setModalError] = useState<string | null>(null);

  const { data: channels, isLoading } = useQuery({
    queryKey: ['channel-connections'],
    queryFn: async () => {
      const res: any = await api.get('/channels');
      return res.data;
    },
  });

  const connectMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res: any = await api.post('/channels', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      setIsModalOpen(false);
      setStoreName('');
      setStoreDomain('');
      setAccessToken('');
      setModalError(null);
    },
    onError: (err: any) => {
      setModalError(err.message || 'Failed to connect store');
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/channels/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
    },
  });

  const handleTestConnection = async (id: any) => {
    const channelId = typeof id === 'object' ? id?._id || id?.id : id;
    if (!channelId) return;
    try {
      const res: any = await api.post(`/channels/${channelId}/test`);
      setTestResults((prev) => ({ ...prev, [channelId]: res.data }));
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [channelId]: { healthy: false, message: err.message || 'Connection test failed' },
      }));
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    connectMutation.mutate({
      channelType: selectedType,
      name: storeName,
      config: {
        storeDomain,
        baseUrl: storeDomain,
      },
      credentials: {
        accessToken,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Channel Integrations</h1>
          <p className="text-xs text-slate-400 mt-1">
            Authorize and manage external storefronts (Shopify, eBay, Custom REST)
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Sales Channel</span>
        </button>
      </div>

      {/* Connected Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-xs text-slate-500">
            Loading connected channels...
          </div>
        ) : channels && channels.length > 0 ? (
          channels.map((channel: any) => {
            const result = testResults[channel._id];
            return (
              <div
                key={channel._id}
                className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200">
                        {channel.channelType === ChannelType.SHOPIFY && '🛍️'}
                        {channel.channelType === ChannelType.EBAY && '🏷️'}
                        {channel.channelType === ChannelType.CUSTOM_STORE && '🌐'}
                      </div>
                      <div>
                        <h3 className="font-bold text-sm text-white">{channel.name}</h3>
                        <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block">
                          {channel.channelType}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                        channel.status === ChannelStatus.ACTIVE
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                          : 'bg-red-950 text-red-400 border border-red-800/60'
                      }`}
                    >
                      {channel.status}
                    </span>
                  </div>

                  {/* Channel stats */}
                  <div className="mt-6 grid grid-cols-2 gap-3 py-3 px-3.5 bg-slate-800/40 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                        Imported Listings
                      </span>
                      <span className="text-base font-bold text-white">
                        {channel.totalListings || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                        Mapped to Catalog
                      </span>
                      <span className="text-base font-bold text-brand-400">
                        {channel.totalMapped || 0}
                      </span>
                    </div>
                  </div>

                  {result && (
                    <div
                      className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                        result.healthy
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/60'
                          : 'bg-red-950/60 text-red-300 border border-red-800/60'
                      }`}
                    >
                      {result.healthy ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span>{result.message}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={() => {
                      const channelId = typeof channel._id === 'object' ? channel._id?._id || channel._id?.id : channel._id;
                      handleTestConnection(channelId);
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold py-2 rounded-xl transition"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Test Connection</span>
                  </button>

                  <button
                    onClick={() => {
                      const channelId = typeof channel._id === 'object' ? channel._id?._id || channel._id?.id : channel._id;
                      disconnectMutation.mutate(channelId);
                    }}
                    title="Disconnect Store"
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-3 bg-slate-900 border border-slate-800 border-dashed rounded-2xl p-12 text-center">
            <Share2 className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">No sales channels connected</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-6">
              Connect your first Shopify, eBay, or custom ecommerce storefront to start synchronizing
              products, orders, and shared inventory.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition"
            >
              <Plus className="w-4 h-4" />
              <span>Connect First Store</span>
            </button>
          </div>
        )}
      </div>

      {/* Connect Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-white">Connect Sales Channel</h2>
            <p className="text-xs text-slate-400 mt-1 mb-4">
              Securely register credentials with AES-256 encryption
            </p>

            {modalError && (
              <div className="mb-4 p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 flex items-start gap-2.5 text-red-200 text-xs">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              {/* Channel Type Selector */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-2">
                  Channel Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { type: ChannelType.SHOPIFY, label: 'Shopify', icon: '🛍️' },
                    { type: ChannelType.EBAY, label: 'eBay', icon: '🏷️' },
                    { type: ChannelType.CUSTOM_STORE, label: 'Custom REST', icon: '🌐' },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.type}
                      onClick={() => setSelectedType(item.type)}
                      className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1 text-xs font-semibold ${
                        selectedType === item.type
                          ? 'bg-brand-600/20 border-brand-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300">
                  Store Nickname
                </label>
                <input
                  type="text"
                  required
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="e.g., US Main Shopify Store"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300">
                  {selectedType === ChannelType.SHOPIFY
                    ? 'Store Domain (e.g., mystore.myshopify.com)'
                    : selectedType === ChannelType.CUSTOM_STORE
                    ? 'API Base URL (e.g., https://mystore.com/api)'
                    : 'eBay Account / Environment (SANDBOX or PRODUCTION)'}
                </label>
                <input
                  type="text"
                  required
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  placeholder={
                    selectedType === ChannelType.SHOPIFY
                      ? 'merchant-store.myshopify.com'
                      : selectedType === ChannelType.CUSTOM_STORE
                      ? 'https://mystore.com/api'
                      : 'SANDBOX'
                  }
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300">
                  {selectedType === ChannelType.CUSTOM_STORE
                    ? 'API Key / Bearer Token (Encrypted at rest)'
                    : 'Access Token / App Key'}
                </label>
                <input
                  type="password"
                  required
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="••••••••••••••••••••••••"
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={connectMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition shadow-lg shadow-brand-600/30"
                >
                  {connectMutation.isPending ? 'Connecting...' : 'Authorize & Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
