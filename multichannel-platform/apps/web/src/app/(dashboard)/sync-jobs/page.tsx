'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  RefreshCw,
  Play,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { SyncJobType } from '@multichannel/shared';

export default function SyncJobsPage() {
  const queryClient = useQueryClient();
  const [selectedJobType, setSelectedJobType] = useState<SyncJobType>(SyncJobType.CATALOG_IMPORT);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ['sync-jobs-list'],
    queryFn: async () => {
      const res: any = await api.get('/sync/jobs');
      return res.data;
    },
    refetchInterval: 5000, // Poll every 5s for active jobs
  });

  const triggerMutation = useMutation({
    mutationFn: async (jobType: SyncJobType) => {
      const res: any = await api.post('/sync/trigger', { jobType });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs-list'] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.post(`/sync/jobs/${id}/retry`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sync-jobs-list'] });
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Synchronization Engine</h1>
          <p className="text-xs text-slate-400 mt-1">
            BullMQ asynchronous worker processing, idempotency controls, and scheduled reconciliation
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedJobType}
            onChange={(e) => setSelectedJobType(e.target.value as SyncJobType)}
            className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs outline-none"
          >
            <option value={SyncJobType.CATALOG_IMPORT}>Catalog Import</option>
            <option value={SyncJobType.INVENTORY_SYNC}>Inventory Sync</option>
            <option value={SyncJobType.PRICE_SYNC}>Price Sync</option>
            <option value={SyncJobType.ORDER_IMPORT}>Order Import</option>
            <option value={SyncJobType.RECONCILIATION}>Reconciliation</option>
          </select>

          <button
            onClick={() => triggerMutation.mutate(selectedJobType)}
            disabled={triggerMutation.isPending}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{triggerMutation.isPending ? 'Queuing...' : 'Trigger Sync Job'}</span>
          </button>
        </div>
      </div>

      {/* Queue Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Catalog Sync', desc: 'Shopify / eBay catalog import', active: true },
          { label: 'Inventory Stream', desc: 'Atomic stock distribution', active: true },
          { label: 'Orders Poller', desc: 'Webhook & polled ingestion', active: true },
          { label: 'Reconciliation', desc: 'Discrepancy detector', active: true },
        ].map((q, idx) => (
          <div key={idx} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-white">{q.label}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            </div>
            <p className="text-[11px] text-slate-400">{q.desc}</p>
          </div>
        ))}
      </div>

      {/* Jobs Log Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            BullMQ Job Processing Queue
          </h2>
          <span className="text-xs text-slate-500">Live Polling (5s)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Created At</th>
                <th className="py-3 px-4">Job Type</th>
                <th className="py-3 px-4">Target Channel</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Attempts</th>
                <th className="py-3 px-4">Outcome / Details</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Loading job stream...
                  </td>
                </tr>
              ) : jobs && jobs.length > 0 ? (
                jobs.map((job: any) => (
                  <tr key={job._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-white font-mono">{job.jobType}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {job.channelConnectionId?.name || 'All Connected Stores'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : job.status === 'PROCESSING'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60 animate-pulse'
                            : job.status === 'FAILED'
                            ? 'bg-red-950 text-red-400 border border-red-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">{job.attemptCount}</td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {job.errorMessage ? (
                        <span className="text-red-400">{job.errorMessage}</span>
                      ) : (
                        job.details?.message || 'Queued in BullMQ worker'
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      {job.status === 'FAILED' && (
                        <button
                          onClick={() => retryMutation.mutate(job._id)}
                          className="flex items-center gap-1 text-brand-400 hover:text-brand-300 text-xs font-semibold ml-auto"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No sync jobs recorded. Click "Trigger Sync Job" to dispatch.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
