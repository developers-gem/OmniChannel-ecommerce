'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Download,
  History,
  ArrowRight,
  Sparkles,
} from 'lucide-react';

const sampleCsv = `SKU,Title,Brand,Category,Barcode,CostPrice,RetailPrice,Stock
APP-TEE-BLK-S,Premium Cotton Crewneck - Black / S,Nordic Apparel,Apparel,8400123001,12.50,34.00,100
APP-TEE-BLK-M,Premium Cotton Crewneck - Black / M,Nordic Apparel,Apparel,8400123002,12.50,34.00,120
APP-TEE-WHT-S,Premium Cotton Crewneck - White / S,Nordic Apparel,Apparel,8400123003,12.50,34.00,85
APP-TEE-WHT-M,Premium Cotton Crewneck - White / M,Nordic Apparel,Apparel,8400123004,12.50,34.00,90
HOM-MUG-CER,Minimalist Ceramic Coffee Mug 12oz,Ceramix,Home Goods,8400123005,4.20,18.50,250`;

export default function CsvImportPage() {
  const queryClient = useQueryClient();
  const [csvContent, setCsvContent] = useState(sampleCsv);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [mappingConfig, setMappingConfig] = useState({
    sku: 'SKU',
    title: 'Title',
    costPrice: 'CostPrice',
    retailPrice: 'RetailPrice',
    stock: 'Stock',
    brand: 'Brand',
    category: 'Category',
    barcode: 'Barcode',
  });
  const [importResult, setImportResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch job history
  const { data: jobs, isLoading: jobsLoading } = useQuery({
    queryKey: ['csv-jobs'],
    queryFn: async () => {
      const res: any = await api.get('/csv/jobs');
      return res.data;
    },
  });

  const previewMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.post('/csv/preview', { csvContent });
      return res.data;
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to parse CSV');
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const res: any = await api.post('/csv/import', {
        csvContent,
        fileName: 'bulk-catalog-upload.csv',
        mappingConfig,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['csv-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['canonical-products'] });
    },
    onError: (err: any) => {
      setError(err.message || 'CSV Import failed');
    },
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">CSV Import & Export Center</h1>
          <p className="text-xs text-slate-400 mt-1">
            Bulk ingest canonical products, update shared stock, and export injection-sanitized spreadsheets
          </p>
        </div>

        <button
          onClick={() => window.open('http://localhost:5050/api/v1/csv/export', '_blank')}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl border border-slate-700 transition"
        >
          <Download className="w-4 h-4 text-brand-400" />
          <span>Export Product Catalog</span>
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 flex items-center gap-3 text-red-200 text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Import Box */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Editor / Paste box */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              CSV Data Input
            </h2>
            <button
              onClick={() => previewMutation.mutate()}
              disabled={previewMutation.isPending}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-brand-400 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-700 transition"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{previewMutation.isPending ? 'Parsing...' : 'Parse & Validate'}</span>
            </button>
          </div>

          <textarea
            rows={10}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
            placeholder="Paste raw CSV content here..."
            className="w-full font-mono text-xs p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 focus:ring-2 focus:ring-brand-500 outline-none leading-relaxed"
          />

          <p className="text-[11px] text-slate-500">
            Tip: Includes formula injection protection. Headers must correspond to mapped attributes.
          </p>
        </div>

        {/* Column Mapping Template */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Column Mapping Configuration
          </h2>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {Object.keys(mappingConfig).map((field) => (
              <div key={field}>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase">
                  {field} *
                </label>
                <input
                  type="text"
                  value={(mappingConfig as any)[field]}
                  onChange={(e) =>
                    setMappingConfig({ ...mappingConfig, [field]: e.target.value })
                  }
                  className="mt-1 w-full px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-white font-mono text-xs outline-none"
                />
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end">
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending}
              className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-brand-600/30 transition disabled:opacity-50"
            >
              {importMutation.isPending ? 'Executing Import...' : 'Run BullMQ Bulk Import'}
            </button>
          </div>
        </div>
      </div>

      {/* Result Alert */}
      {importResult && (
        <div className="bg-emerald-950/60 border border-emerald-800/80 rounded-2xl p-5 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-bold text-sm text-emerald-300 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>CSV Import Job Executed Successfully</span>
          </div>
          <div className="grid grid-cols-3 gap-4 font-mono text-slate-300 mt-3 bg-slate-900/60 p-3 rounded-xl border border-emerald-900/40">
            <div>Total Rows: {importResult.totalRows}</div>
            <div className="text-emerald-400 font-bold">Successful: {importResult.successfulRows}</div>
            <div className="text-red-400">Failed Rows: {importResult.failedRows}</div>
          </div>
        </div>
      )}

      {/* Import Job History */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
            Import Job History
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Total Rows</th>
                <th className="py-3 px-4 text-center">Success</th>
                <th className="py-3 px-4 text-center">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {jobsLoading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Loading jobs history...
                  </td>
                </tr>
              ) : jobs && jobs.length > 0 ? (
                jobs.map((job: any) => (
                  <tr key={job._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-200">{job.fileName}</td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-red-950 text-red-400 border border-red-800/60'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono">{job.totalRows}</td>
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-400 font-bold">
                      {job.successfulRows}
                    </td>
                    <td className="py-3.5 px-4 text-center font-mono text-red-400 font-bold">
                      {job.failedRows}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No import jobs run yet.
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
