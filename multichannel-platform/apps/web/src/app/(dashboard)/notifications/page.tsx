'use client';

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Bell, CheckCheck, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res: any = await api.get('/notifications');
      return res.data;
    },
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

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Notifications & Alerts</h1>
          <p className="text-xs text-slate-400 mt-1">
            System health, inventory depletion alerts, and channel status updates
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={() => markAllMutation.mutate()}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 transition"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {/* List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="py-12 text-center text-xs text-slate-500">Loading alerts...</div>
        ) : notifications.length > 0 ? (
          notifications.map((n: any) => (
            <div
              key={n._id}
              onClick={() => !n.isRead && markOneMutation.mutate(n._id)}
              className={`p-4 rounded-2xl border transition cursor-pointer flex items-start gap-4 ${
                n.isRead
                  ? 'bg-slate-900/60 border-slate-800/80 text-slate-400'
                  : 'bg-slate-900 border-slate-700 shadow-lg text-white'
              }`}
            >
              <div className="mt-0.5">
                {n.severity === 'CRITICAL' || n.severity === 'WARNING' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                ) : n.severity === 'SUCCESS' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Info className="w-5 h-5 text-blue-400" />
                )}
              </div>

              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm">{n.title}</h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs mt-1 text-slate-300">{n.message}</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="bg-slate-800 text-slate-400 px-2 py-0.5 rounded text-[10px] font-semibold uppercase">
                    {n.category}
                  </span>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center">
            <Bell className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-bold text-white">No notifications</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
              You are caught up! Inventory threshold warnings and sync alerts will appear here.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
