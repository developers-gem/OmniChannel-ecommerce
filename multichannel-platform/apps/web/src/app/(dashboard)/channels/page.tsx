'use client';

import React, { useState, useEffect } from 'react';
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
  ArrowDownToLine,
  Layers,
  DollarSign,
  Boxes,
  Zap,
  Key,
} from 'lucide-react';
import { ChannelType, ChannelStatus } from '@multichannel/shared';

export default function ChannelsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<ChannelType>(ChannelType.SHOPIFY);
  const [storeName, setStoreName] = useState('');
  const [storeDomain, setStoreDomain] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [ebayAuthMode, setEbayAuthMode] = useState<'oauth' | 'manual'>('oauth');
  const [shopifyAuthMode, setShopifyAuthMode] = useState<'oauth' | 'manual'>('oauth');
  const [isOAuthRedirecting, setIsOAuthRedirecting] = useState(false);
  const [isShopifyOAuthRedirecting, setIsShopifyOAuthRedirecting] = useState(false);
  const [shopifyClientId, setShopifyClientId] = useState('');
  const [shopifyClientSecret, setShopifyClientSecret] = useState('');
  const [pastedCodeOrUrl, setPastedCodeOrUrl] = useState('');


  const [isVerifyingEbayCode, setIsVerifyingEbayCode] = useState(false);
  const [oauthWindowOpened, setOauthWindowOpened] = useState(false);
  const [shopifyOauthWindowOpened, setShopifyOauthWindowOpened] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [modalError, setModalError] = useState<string | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [bannerMessage, setBannerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    // Listen for postMessage from popup window (when eBay or Shopify redirects to callback)
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === 'EBAY_AUTH_SUCCESS') {
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        setIsModalOpen(false);
        setOauthWindowOpened(false);
        setPastedCodeOrUrl('');
        setBannerMessage({
          type: 'success',
          text: 'eBay store connected successfully via OAuth! Long-lived refresh token saved — tokens will auto-renew seamlessly.',
        });
      } else if (event.data?.type === 'EBAY_AUTH_ERROR') {
        setModalError(`eBay Authorization Error: ${event.data.error || 'Failed'}`);
        setIsOAuthRedirecting(false);
        setIsVerifyingEbayCode(false);
      } else if (event.data?.type === 'SHOPIFY_AUTH_SUCCESS') {
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        setIsModalOpen(false);
        setShopifyOauthWindowOpened(false);
        setIsShopifyOAuthRedirecting(false);
        setBannerMessage({
          type: 'success',
          text: `Shopify store ${event.data.storeName ? `'${event.data.storeName}' ` : ''}connected successfully via OAuth! Permanent offline access token saved.`,
        });
      } else if (event.data?.type === 'SHOPIFY_AUTH_ERROR') {
        setModalError(`Shopify Authorization Error: ${event.data.error || 'Failed'}`);
        setIsShopifyOAuthRedirecting(false);
      }
    };
    window.addEventListener('message', handleAuthMessage);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('ebay_connected') === 'true') {
        setBannerMessage({
          type: 'success',
          text: 'eBay store connected successfully via OAuth! Long-lived refresh token saved — tokens will auto-renew seamlessly.',
        });
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('ebay_error')) {
        setBannerMessage({
          type: 'error',
          text: `eBay Authorization Error: ${decodeURIComponent(params.get('ebay_error') || '')}`,
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('shopify_connected') === 'true') {
        setBannerMessage({
          type: 'success',
          text: 'Shopify store connected successfully via OAuth! Permanent offline access token saved.',
        });
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (params.get('shopify_error')) {
        setBannerMessage({
          type: 'error',
          text: `Shopify Authorization Error: ${decodeURIComponent(params.get('shopify_error') || '')}`,
        });
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }

    return () => window.removeEventListener('message', handleAuthMessage);
  }, [queryClient]);


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
      setRefreshToken('');
      setAuthCode('');
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
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
    },
  });

  // Pull external catalog into ChannelProduct
  const syncMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setActiveActionId(`sync-${channelId}`);
      setBannerMessage(null);
      const res: any = await api.post('/sync/trigger', {
        channelConnectionId: channelId,
        jobType: 'CATALOG_IMPORT',
      });
      return res.data;
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
        queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
        setActiveActionId(null);
        setBannerMessage({
          type: 'success',
          text: 'External catalog refreshed! You can now import products to Master Catalog or link them.',
        });
      }, 1500);
    },
    onError: (err: any) => {
      setActiveActionId(null);
      setBannerMessage({ type: 'error', text: err.message || 'Failed to sync external catalog' });
    },
  });

  // Import all products from Shopify into Canonical / Master Catalog
  const importToCanonicalMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setActiveActionId(`import-${channelId}`);
      setBannerMessage(null);
      const res: any = await api.post('/sync/import-to-canonical', {
        channelConnectionId: channelId,
      });
      return res.data;
    },
    onSuccess: (data: any) => {
      setActiveActionId(null);
      const info = data?.data || data;
      setBannerMessage({
        type: 'success',
        text: info?.message || 'Successfully imported all Shopify products into Master Catalog with variants and stock!',
      });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
      queryClient.invalidateQueries({ queryKey: ['product-mappings'] });
      queryClient.invalidateQueries({ queryKey: ['mapping-suggestions'] });
      setTimeout(() => setBannerMessage(null), 8000);
    },
    onError: (err: any) => {
      setActiveActionId(null);
      setBannerMessage({
        type: 'error',
        text: err.message || 'Failed to import products to master catalog',
      });
      setTimeout(() => setBannerMessage(null), 8000);
    },
  });

  // Push current inventory to Shopify
  const syncInventoryMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setActiveActionId(`stock-${channelId}`);
      setBannerMessage(null);
      const res: any = await api.post('/sync/trigger', {
        channelConnectionId: channelId,
        jobType: 'INVENTORY_SYNC',
      });
      return res.data;
    },
    onSuccess: () => {
      setActiveActionId(null);
      setBannerMessage({
        type: 'success',
        text: 'Inventory sync job queued! Platform stock levels are updating on Shopify.',
      });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      setTimeout(() => setBannerMessage(null), 6000);
    },
    onError: (err: any) => {
      setActiveActionId(null);
      setBannerMessage({ type: 'error', text: err.message || 'Failed to sync inventory' });
      setTimeout(() => setBannerMessage(null), 6000);
    },
  });

  // Push current prices to Shopify
  const syncPriceMutation = useMutation({
    mutationFn: async (channelId: string) => {
      setActiveActionId(`price-${channelId}`);
      setBannerMessage(null);
      const res: any = await api.post('/sync/trigger', {
        channelConnectionId: channelId,
        jobType: 'PRICE_SYNC',
      });
      return res.data;
    },
    onSuccess: () => {
      setActiveActionId(null);
      setBannerMessage({
        type: 'success',
        text: 'Price sync job queued! Master prices are being pushed to Shopify.',
      });
      queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
      setTimeout(() => setBannerMessage(null), 6000);
    },
    onError: (err: any) => {
      setActiveActionId(null);
      setBannerMessage({ type: 'error', text: err.message || 'Failed to sync prices' });
      setTimeout(() => setBannerMessage(null), 6000);
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

  const handleEbayOAuthConnect = async () => {
    try {
      setIsOAuthRedirecting(true);
      setModalError(null);
      const targetName = storeName.trim() || 'eBay Sandbox Store';
      const isSandbox = !storeDomain || storeDomain.includes('sandbox');
      const env = isSandbox ? 'SANDBOX' : 'PRODUCTION';

      const res: any = await api.get(
        `/channels/ebay/auth-url?name=${encodeURIComponent(targetName)}&environment=${env}`
      );
      if (res?.data?.url) {
        // Open eBay OAuth in popup / new tab so user never loses their active platform state
        const popup = window.open(
          res.data.url,
          'ebay_oauth_popup',
          'width=720,height=820,menubar=no,status=no,toolbar=no'
        );
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.open(res.data.url, '_blank');
        }
        setOauthWindowOpened(true);
        setIsOAuthRedirecting(false);
      } else {
        throw new Error('Failed to obtain eBay authorization URL');
      }
    } catch (err: any) {
      setIsOAuthRedirecting(false);
      setModalError(err.message || 'Failed to start eBay OAuth connection');
    }
  };

  const handleCompleteEbayOAuth = async (inputCodeOrUrl?: string) => {
    const rawInput = (inputCodeOrUrl || pastedCodeOrUrl || authCode).trim();
    if (!rawInput) {
      setModalError('Please paste the eBay completion URL or authorization code from your browser address bar.');
      return;
    }

    try {
      setIsVerifyingEbayCode(true);
      setModalError(null);
      const targetName = storeName.trim() || 'eBay Sandbox Store';
      const isSandbox = !storeDomain || storeDomain.includes('sandbox');
      const env = isSandbox ? 'SANDBOX' : 'PRODUCTION';

      const res: any = await api.post('/channels/ebay/exchange-code', {
        code: rawInput,
        name: targetName,
        environment: env,
      });

      if (res?.success) {
        queryClient.invalidateQueries({ queryKey: ['channel-connections'] });
        setIsModalOpen(false);
        setStoreName('');
        setStoreDomain('');
        setPastedCodeOrUrl('');
        setAuthCode('');
        setOauthWindowOpened(false);
        setBannerMessage({
          type: 'success',
          text: `eBay store '${targetName}' connected successfully via OAuth! Long-lived refresh token saved — tokens will auto-renew seamlessly.`,
        });
      } else {
        throw new Error(res?.error?.message || 'Failed to verify eBay authorization code');
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to exchange eBay authorization code');
    } finally {
      setIsVerifyingEbayCode(false);
    }
  };

  const handleShopifyOAuthConnect = async () => {
    let domain = storeDomain.trim();
    if (!domain) {
      setModalError('Please enter your Shopify store domain (e.g., amazingink-1.myshopify.com)');
      return;
    }
    domain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (!domain.includes('.myshopify.com')) {
      domain = `${domain}.myshopify.com`;
    }

    try {
      setIsShopifyOAuthRedirecting(true);
      setModalError(null);
      const targetName = storeName.trim() || domain.replace('.myshopify.com', '');

      const res: any = await api.get('/channels/shopify/auth-url', {
        params: {
          shop: domain,
          name: targetName,
          clientId: shopifyClientId.trim(),
          clientSecret: shopifyClientSecret.trim(),
        },
      });


      if (res?.data?.url) {
        const popup = window.open(
          res.data.url,
          'shopify_oauth_popup',
          'width=720,height=820,menubar=no,status=no,toolbar=no'
        );
        if (!popup || popup.closed || typeof popup.closed === 'undefined') {
          window.open(res.data.url, '_blank');
        }
        setShopifyOauthWindowOpened(true);
        setIsShopifyOAuthRedirecting(false);
      } else {
        throw new Error('Failed to obtain Shopify authorization URL');
      }
    } catch (err: any) {
      setIsShopifyOAuthRedirecting(false);
      setModalError(err.message || 'Failed to start Shopify OAuth connection');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (selectedType === ChannelType.SHOPIFY && shopifyAuthMode === 'oauth') {
      handleShopifyOAuthConnect();
      return;
    }

    let domain = storeDomain.trim();
    if (selectedType === ChannelType.EBAY && (!domain || domain.length === 0)) {
      domain = 'api.sandbox.ebay.com';
    }

    const payload: any = {
      channelType: selectedType,
      name: storeName.trim() || (selectedType === ChannelType.EBAY ? 'eBay Sandbox Store' : 'New Store'),
      config: {
        storeDomain: domain,
        baseUrl: domain,
        environment: domain.includes('sandbox') ? 'SANDBOX' : 'PRODUCTION',
      },
      credentials: {},
    };

    if (selectedType === ChannelType.EBAY) {
      if (pastedCodeOrUrl.trim()) {
        payload.credentials.code = pastedCodeOrUrl.trim();
      } else if (authCode.trim()) {
        payload.credentials.code = authCode.trim();
      }
      if (refreshToken.trim()) {
        payload.credentials.refreshToken = refreshToken.trim();
      }
      if (accessToken.trim()) {
        payload.credentials.accessToken = accessToken.trim();
      }
    } else {
      payload.credentials.accessToken = accessToken.trim();
    }

    connectMutation.mutate(payload);
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

      {/* Banner Feedback */}
      {bannerMessage && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 text-xs border shadow-lg ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800/80 text-emerald-200'
              : 'bg-red-950/70 border-red-800/80 text-red-200'
          }`}
        >
          {bannerMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span className="font-medium">{bannerMessage.text}</span>
        </div>
      )}

      {/* Connected Channel Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-3 text-center py-12 text-xs text-slate-500">
            Loading connected channels...
          </div>
        ) : channels && channels.length > 0 ? (
          channels.map((channel: any) => {
            const channelId = typeof channel._id === 'object' ? channel._id?._id || channel._id?.id : channel._id;
            const result = testResults[channelId];
            const isImportRunning = activeActionId === `import-${channelId}`;
            const isCatalogSyncRunning = activeActionId === `sync-${channelId}`;
            const isStockSyncRunning = activeActionId === `stock-${channelId}`;
            const isPriceSyncRunning = activeActionId === `price-${channelId}`;

            return (
              <div
                key={channelId}
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
                        Store Products
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-white">
                          {channel.totalProducts || channel.totalListings || 0}
                        </span>
                        <span className="text-[10px] text-slate-400">products</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        {channel.totalListings || 0} listings / variants
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-semibold text-slate-500 block">
                        Mapped to Catalog
                      </span>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-brand-400">
                          {channel.totalMapped || 0}
                        </span>
                        <span className="text-[10px] text-slate-400">mapped</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-semibold block mt-0.5">
                        {channel.totalListings > 0 && channel.totalMapped >= channel.totalListings
                          ? '100% Synchronized'
                          : `${channel.totalMapped} / ${channel.totalListings} synced`}
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

                {/* Main 1-Click Import Action */}
                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => importToCanonicalMutation.mutate(channelId)}
                    disabled={isImportRunning}
                    className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
                    title="Convert all Shopify products into platform master products with stock & 1:1 mappings"
                  >
                    <ArrowDownToLine className={`w-4 h-4 ${isImportRunning ? 'animate-bounce' : ''}`} />
                    <span>
                      {isImportRunning
                        ? 'Importing All Products to Catalog...'
                        : 'Import All to Master Catalog'}
                    </span>
                  </button>

                  {/* Secondary Sync Actions */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => syncMutation.mutate(channelId)}
                      disabled={isCatalogSyncRunning}
                      className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-2 rounded-xl border border-slate-700/60 transition disabled:opacity-50"
                      title="Fetch latest listings from Shopify"
                    >
                      <RefreshCw className={`w-3 h-3 ${isCatalogSyncRunning ? 'animate-spin' : ''}`} />
                      <span>{isCatalogSyncRunning ? 'Syncing...' : 'Sync Catalog'}</span>
                    </button>

                    <button
                      onClick={() => syncInventoryMutation.mutate(channelId)}
                      disabled={isStockSyncRunning}
                      className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-2 rounded-xl border border-slate-700/60 transition disabled:opacity-50"
                      title="Push platform available stock to Shopify"
                    >
                      <Boxes className="w-3 h-3 text-emerald-400" />
                      <span>{isStockSyncRunning ? 'Pushing...' : 'Sync Stock'}</span>
                    </button>

                    <button
                      onClick={() => syncPriceMutation.mutate(channelId)}
                      disabled={isPriceSyncRunning}
                      className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-semibold py-2 rounded-xl border border-slate-700/60 transition disabled:opacity-50"
                      title="Push platform retail prices to Shopify"
                    >
                      <DollarSign className="w-3 h-3 text-yellow-400" />
                      <span>{isPriceSyncRunning ? 'Pushing...' : 'Sync Price'}</span>
                    </button>
                  </div>
                </div>

                {/* Footer Utilities */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
                  <button
                    onClick={() => handleTestConnection(channelId)}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition text-[11px]"
                  >
                    <Activity className="w-3.5 h-3.5 text-blue-400" />
                    <span>Test Connection</span>
                  </button>

                  <button
                    onClick={() => disconnectMutation.mutate(channelId)}
                    title="Disconnect Store"
                    className="flex items-center gap-1 text-slate-500 hover:text-red-400 transition text-[11px]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-3 bg-slate-900 border border-slate-800 border-dashed rounded-2xl p-12 text-center">
            <ShoppingBag className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">No active storefronts connected</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-6">
              Connect your Shopify store using an Admin API Access Token to start synchronizing products.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition"
            >
              Connect First Channel
            </button>
          </div>
        )}
      </div>

      {/* Connect Store Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <h2 className="text-lg font-bold text-white mb-1">Connect Sales Channel</h2>
            <p className="text-xs text-slate-400 mb-6">
              Establish a secure, encrypted handshake with your external ecommerce platform.
            </p>

            {modalError && (
              <div className="p-3 bg-red-950/60 border border-red-800 rounded-xl text-red-300 text-xs flex items-center gap-2 mb-4">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Channel Provider
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedType(ChannelType.SHOPIFY)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                      selectedType === ChannelType.SHOPIFY
                        ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-lg">🛍️</span>
                    <span>Shopify</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedType(ChannelType.EBAY)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                      selectedType === ChannelType.EBAY
                        ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-lg">🏷️</span>
                    <span>eBay</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedType(ChannelType.CUSTOM_STORE)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition ${
                      selectedType === ChannelType.CUSTOM_STORE
                        ? 'bg-brand-600/20 border-brand-500 text-brand-300'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    <span className="text-lg">🌐</span>
                    <span>Custom REST</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Store Nickname
                </label>
                <input
                  type="text"
                  required
                  placeholder={
                    selectedType === ChannelType.EBAY
                      ? 'e.g., eBay Sandbox Store'
                      : selectedType === ChannelType.SHOPIFY
                      ? 'e.g., US Main Store'
                      : 'e.g., Custom API Store'
                  }
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500"
                />
              </div>

              {/* Domain / Environment Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    {selectedType === ChannelType.EBAY
                      ? 'eBay Environment / API Host'
                      : selectedType === ChannelType.SHOPIFY
                      ? 'Shopify Store Domain'
                      : 'Store Domain / Base URL'}
                  </label>
                  {selectedType === ChannelType.EBAY && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setStoreDomain('api.sandbox.ebay.com')}
                        className={`px-2 py-0.5 rounded transition ${
                          storeDomain === 'api.sandbox.ebay.com' || !storeDomain
                            ? 'bg-amber-600/30 text-amber-300 border border-amber-500/50'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Sandbox
                      </button>
                      <button
                        type="button"
                        onClick={() => setStoreDomain('api.ebay.com')}
                        className={`px-2 py-0.5 rounded transition ${
                          storeDomain === 'api.ebay.com'
                            ? 'bg-blue-600/30 text-blue-300 border border-blue-500/50'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        Production
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder={
                    selectedType === ChannelType.EBAY
                      ? 'api.sandbox.ebay.com'
                      : selectedType === ChannelType.SHOPIFY
                      ? 'your-store.myshopify.com'
                      : 'https://api.yourdomain.com'
                  }
                  value={storeDomain}
                  onChange={(e) => setStoreDomain(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  {selectedType === ChannelType.EBAY
                    ? 'Default is api.sandbox.ebay.com for testing, or api.ebay.com for production.'
                    : selectedType === ChannelType.SHOPIFY
                    ? 'Your myshopify domain (e.g., your-store.myshopify.com).'
                    : 'The base API URL for custom catalog sync.'}
                </p>
              </div>

              {/* Channel-Specific Authentication Fields */}
              {selectedType === ChannelType.EBAY ? (
                <div className="space-y-4 pt-1">
                  {/* Mode Selector Tabs */}
                  <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => setEbayAuthMode('oauth')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        ebayAuthMode === 'oauth'
                          ? 'bg-brand-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>1-Click OAuth Grant</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEbayAuthMode('manual')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        ebayAuthMode === 'manual'
                          ? 'bg-brand-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Refresh Token / Localhost</span>
                    </button>
                  </div>

                  {ebayAuthMode === 'oauth' ? (
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400 mt-0.5 shrink-0">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">OAuth 2.0 Authorization Flow</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Authenticate with eBay. Our platform exchanges the authorization code for an 18-month Refresh Token and auto-renews 2-hour access tokens in the background forever.
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleEbayOAuthConnect}
                        disabled={isOAuthRedirecting}
                        className="w-full mt-2 py-2.5 px-4 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-brand-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                      >
                        {isOAuthRedirecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Opening eBay Consent Screen...</span>
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-4 h-4" />
                            <span>
                              {oauthWindowOpened
                                ? 'Re-open eBay Consent Screen'
                                : 'Sign in & Connect with eBay (Opens in New Tab)'}
                            </span>
                          </>
                        )}
                      </button>

                      {/* Step 2: Finalize Connection Box */}
                      <div className="mt-3 pt-3 border-t border-slate-700/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-semibold text-slate-200">
                            Paste eBay Address Bar URL or Authorization Code:
                          </label>
                          <span className="text-[10px] text-emerald-400 font-medium">Final Step</span>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          When eBay displays <strong className="text-emerald-400">&quot;Authorization successfully completed&quot;</strong>, copy the full URL from that browser tab&apos;s address bar (or just the code) and paste it below:
                        </p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            placeholder="https://auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?isAuthSuccessful=true&state=...&code=v^1.1#..."
                            value={pastedCodeOrUrl}
                            onChange={(e) => {
                              setPastedCodeOrUrl(e.target.value);
                              setModalError(null);
                            }}
                            className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => handleCompleteEbayOAuth()}
                            disabled={isVerifyingEbayCode || !pastedCodeOrUrl.trim()}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition flex items-center gap-1.5 shrink-0"
                          >
                            {isVerifyingEbayCode ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Connecting...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Complete Connection</span>
                              </>
                            )}
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-500">
                          💡 You can paste the entire address bar URL from the confirmation tab — the authorization code will be extracted automatically.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/40 text-[11px] text-amber-200">
                        <span className="font-semibold block mb-0.5">💡 Localhost & Developer Testing:</span>
                        Paste your 18-month <strong>Refresh Token</strong> from the Developer Portal. The server will immediately generate 2-hour access tokens and auto-renew them silently before every sync.
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          eBay OAuth Refresh Token (Recommended)
                        </label>
                        <input
                          type="password"
                          placeholder="v^1.1#i^1#p^3#... (18-Month Refresh Token)"
                          value={refreshToken}
                          onChange={(e) => setRefreshToken(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Lasts up to 18 months. Provides permanent auto-renewal with no 2-hour expiration.
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          User Access Token (Optional fallback)
                        </label>
                        <input
                          type="password"
                          placeholder="v^1.1#i^1#... (2-Hour User Token)"
                          value={accessToken}
                          onChange={(e) => setAccessToken(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          Optional if Refresh Token is provided above (the server will generate it automatically).
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Authorization Code (Optional)
                        </label>
                        <input
                          type="text"
                          placeholder="v^1.1#i^1#... (If obtained from eBay consent URL)"
                          value={authCode}
                          onChange={(e) => setAuthCode(e.target.value)}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : selectedType === ChannelType.SHOPIFY ? (
                <div className="space-y-4 pt-1">
                  {/* Mode Selector Tabs */}
                  <div className="flex rounded-xl bg-slate-800/80 p-1 border border-slate-700/80">
                    <button
                      type="button"
                      onClick={() => setShopifyAuthMode('oauth')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        shopifyAuthMode === 'oauth'
                          ? 'bg-brand-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Zap className="w-3.5 h-3.5" />
                      <span>1-Click Shopify OAuth</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setShopifyAuthMode('manual')}
                      className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        shopifyAuthMode === 'manual'
                          ? 'bg-brand-600 text-white shadow-md'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Key className="w-3.5 h-3.5" />
                      <span>Admin API Token</span>
                    </button>
                  </div>

                  {shopifyAuthMode === 'oauth' ? (
                    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/80 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mt-0.5 shrink-0">
                          <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-white">OAuth 2.0 Permanent Token Flow</h4>
                          <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                            Authorizes our app via your deployed backend (<code className="text-emerald-300 font-mono text-[10px]">omnichannel-api-m9hx.onrender.com</code>). Shopify issues a <strong>permanent offline access token</strong> that never expires.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-700/60">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                            Shopify App Client ID
                          </label>
                          <input
                            type="text"
                            placeholder="Client ID"
                            value={shopifyClientId}
                            onChange={(e) => setShopifyClientId(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[11px] outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-300 mb-1">
                            Client Secret
                          </label>
                          <input
                            type="password"
                            placeholder="Client Secret"
                            value={shopifyClientSecret}
                            onChange={(e) => setShopifyClientSecret(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white text-[11px] outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleShopifyOAuthConnect}
                        disabled={isShopifyOAuthRedirecting}
                        className="w-full mt-2 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition disabled:opacity-50"
                      >
                        {isShopifyOAuthRedirecting ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Opening Shopify App Consent...</span>
                          </>
                        ) : (
                          <>
                            <ExternalLink className="w-4 h-4" />
                            <span>
                              {shopifyOauthWindowOpened
                                ? 'Re-open Shopify Consent Screen'
                                : 'Sign in & Connect with Shopify (Opens in New Tab)'}
                            </span>
                          </>
                        )}
                      </button>
                      <p className="text-[10px] text-slate-500 text-center">
                        Opens official Shopify authorization for <span className="text-slate-300 font-mono">{storeDomain || 'your-store.myshopify.com'}</span>.
                      </p>

                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Shopify Admin API Access Token
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="shpat_xxxxxxxxxxxxxxxxxxxxx"
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Live-validated against Shopify Admin API before saving. Encrypted with AES-256-GCM.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Admin API Access Token / API Key
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="API Key or Bearer Token"
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none focus:border-brand-500 font-mono"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Live-validated against custom API before saving.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                {selectedType === ChannelType.EBAY && ebayAuthMode === 'oauth' ? (
                  pastedCodeOrUrl.trim() ? (
                    <button
                      type="button"
                      onClick={() => handleCompleteEbayOAuth()}
                      disabled={isVerifyingEbayCode}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isVerifyingEbayCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying & Connecting...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete & Verify Connection</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEbayOAuthConnect}
                      disabled={isOAuthRedirecting}
                      className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
                    >
                      {isOAuthRedirecting ? 'Opening eBay Window...' : 'Connect via eBay OAuth'}
                    </button>
                  )
                ) : selectedType === ChannelType.SHOPIFY && shopifyAuthMode === 'oauth' ? (
                  <button
                    type="button"
                    onClick={handleShopifyOAuthConnect}
                    disabled={isShopifyOAuthRedirecting}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isShopifyOAuthRedirecting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Opening Shopify...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5" />
                        <span>Connect via Shopify OAuth</span>
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={connectMutation.isPending}
                    className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
                  >
                    {connectMutation.isPending ? 'Verifying Credentials...' : 'Save & Connect'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
