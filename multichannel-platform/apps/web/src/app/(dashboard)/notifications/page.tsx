'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Info,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Layers,
  Radio,
  RefreshCw,
  ShoppingBag,
  Sparkles,
} from 'lucide-react';

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'all' | 'channels' | 'sync' | 'inventory' | 'unread'>('all');
  const [channelFilter, setChannelFilter] = useState<string>('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['notifications-list', activeTab, channelFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeTab === 'unread') params.append('isRead', 'false');
      if (activeTab === 'sync') params.append('category', 'SYNC');
      if (activeTab === 'inventory') params.append('category', 'INVENTORY');
      if (activeTab === 'channels') {
        if (channelFilter) {
          params.append('channelType', channelFilter);
        }
      } else if (channelFilter) {
        params.append('channelType', channelFilter);
      }

      const queryString = params.toString();
      const res: any = await api.get(`/notifications${queryString ? `?${queryString}` : ''}`);
      return res.data;
    },
    refetchInterval: 5000, // Real-time live polling every 5s for uploaded & modified products
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.put('/notifications/read-all');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.put(`/notifications/${id}/read`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const deleteOneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.delete(`/notifications/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const clearAllReadMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.delete('/notifications/clear-all');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const notifications = (data?.notifications || []).filter((n: any) => {
    if (activeTab === 'channels' && !channelFilter) {
      return Boolean(n.channelType);
    }
    return true;
  });

  const unreadCount = data?.unreadCount || 0;
  const totalCount = data?.totalCount || notifications.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white">Notifications & Alerts</h1>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Live Updates Active</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time notifications when products are uploaded, imported, or modified across Shopify, eBay, and platform catalog
          </p>
        </div>

        {/* Top Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition shadow-sm"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark All as Read ({unreadCount})</span>
            </button>
          )}

          <button
            onClick={() => clearAllReadMutation.mutate()}
            disabled={clearAllReadMutation.isPending}
            className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 text-xs font-medium px-3 py-2 rounded-xl border border-slate-700 transition"
            title="Clear all already read notifications"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Read</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            onClick={() => {
              setActiveTab('all');
              setChannelFilter('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-slate-800 text-white border border-slate-700 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <span>All</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700/60 text-slate-300 font-mono">
              {totalCount}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveTab('channels');
              setChannelFilter('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'channels'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>Shopify & eBay</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('sync');
              setChannelFilter('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'sync'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Sync & Uploads</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('inventory');
              setChannelFilter('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'inventory'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Inventory</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('unread');
              setChannelFilter('');
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'unread'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Unread</span>
            {unreadCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 font-bold">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Channel Pill Selector */}
        {activeTab === 'channels' && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 text-[11px] mr-1">Channel:</span>
            <button
              onClick={() => setChannelFilter('')}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                !channelFilter ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Channels
            </button>
            <button
              onClick={() => setChannelFilter('SHOPIFY')}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                channelFilter === 'SHOPIFY'
                  ? 'bg-emerald-600 text-white'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              }`}
            >
              Shopify
            </button>
            <button
              onClick={() => setChannelFilter('EBAY')}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition ${
                channelFilter === 'EBAY' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-blue-500/10'
              }`}
            >
              eBay
            </button>
          </div>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-16 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-500" />
            <span>Fetching live notifications...</span>
          </div>
        ) : notifications.length > 0 ? (
          notifications.map((n: any) => (
            <div
              key={n._id}
              className={`p-4 rounded-2xl border transition-all duration-150 flex items-start gap-4 ${
                n.isRead
                  ? 'bg-slate-900/40 border-slate-800/60 text-slate-400 hover:border-slate-700'
                  : 'bg-slate-900/90 border-slate-700/80 shadow-md text-white hover:border-slate-600'
              }`}
            >
              {/* Severity Icon */}
              <div className="mt-0.5 shrink-0">
                {n.severity === 'CRITICAL' || n.severity === 'WARNING' ? (
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : n.severity === 'SUCCESS' ? (
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                    <Info className="w-4 h-4" />
                  </div>
                )}
              </div>

              {/* Notification Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <h3 className={`font-semibold text-sm ${n.isRead ? 'text-slate-300' : 'text-white'}`}>
                      {n.title}
                    </h3>

                    {/* Channel Badge */}
                    {n.channelType && (
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          n.channelType === 'SHOPIFY'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : n.channelType === 'EBAY'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/30'
                        }`}
                      >
                        {n.channelType}
                      </span>
                    )}

                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" title="Unread" />
                    )}
                  </div>

                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(n.createdAt).toLocaleDateString()} {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-xs mt-1.5 text-slate-300 leading-relaxed break-words">{n.message}</p>

                {/* Footer Action & Category Tags */}
                <div className="mt-3 flex items-center justify-between gap-2 flex-wrap pt-2 border-t border-slate-800/60">
                  <div className="flex items-center gap-2">
                    <span className="bg-slate-800/80 text-slate-400 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider">
                      {n.category}
                    </span>

                    {n.link && (
                      <Link
                        href={n.link}
                        className="text-[11px] font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1 hover:underline transition"
                      >
                        <span>Open Details</span>
                        <ExternalLink className="w-3 h-3" />
                      </Link>
                    )}
                  </div>

                  {/* Actions: Mark read / Delete */}
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <button
                        onClick={() => markOneMutation.mutate(n._id)}
                        disabled={markOneMutation.isPending}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition px-2 py-1 rounded hover:bg-slate-800"
                        title="Mark as read"
                      >
                        <CheckCheck className="w-3 h-3 text-slate-400" />
                        <span>Mark read</span>
                      </button>
                    )}

                    <button
                      onClick={() => deleteOneMutation.mutate(n._id)}
                      disabled={deleteOneMutation.isPending}
                      className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition"
                      title="Delete notification"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto mb-3 text-slate-500">
              <Bell className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">No notifications found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 leading-relaxed">
              {activeTab === 'unread'
                ? "You're all caught up! No unread notifications."
                : activeTab === 'channels'
                ? 'No Shopify or eBay upload notifications yet. Once products are pushed, imported, or modified from channels, alerts will automatically appear here.'
                : 'System alerts, product uploads, modifications, and channel sync updates will appear here automatically in real time.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
