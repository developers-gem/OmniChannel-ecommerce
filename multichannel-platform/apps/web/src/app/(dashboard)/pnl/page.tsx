'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  PieChart as PieIcon,
  BarChart3,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function PnLPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'products' | 'channels'>('overview');

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ['pnl-summary'],
    queryFn: async () => {
      const res: any = await api.get('/pnl/summary');
      return res.data;
    },
  });

  const { data: trendsData } = useQuery({
    queryKey: ['pnl-trends-full'],
    queryFn: async () => {
      const res: any = await api.get('/pnl/trends?days=30');
      return res.data;
    },
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['pnl-products'],
    queryFn: async () => {
      const res: any = await api.get('/pnl/products');
      return res.data;
    },
  });

  const { data: channelsData, isLoading: channelsLoading } = useQuery({
    queryKey: ['pnl-channels'],
    queryFn: async () => {
      const res: any = await api.get('/pnl/channels');
      return res.data;
    },
  });

  const metrics = summaryData?.metrics || {
    totalRevenue: 0,
    totalDiscounts: 0,
    totalRefunds: 0,
    netRevenue: 0,
    totalCOGS: 0,
    totalMarketplaceFees: 0,
    totalPaymentFees: 0,
    totalShippingExpenses: 0,
    grossProfit: 0,
    netContribution: 0,
    grossMarginPercentage: 0,
    netMarginPercentage: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Profit & Loss Analytics</h1>
          <p className="text-xs text-slate-400 mt-1">
            Historical COGS matching, marketplace take rates, and product contribution margins
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'overview' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview & Margin
          </button>
          <button
            onClick={() => setActiveTab('products')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'products' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Product Breakdown
          </button>
          <button
            onClick={() => setActiveTab('channels')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'channels' ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            Channel Contribution
          </button>
        </div>
      </div>

      {/* Primary KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Net Revenue</span>
          <div className="text-2xl font-extrabold text-white mt-1">
            ${metrics.netRevenue?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            After discounts & refunds
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Cost of Goods (COGS)</span>
          <div className="text-2xl font-extrabold text-amber-400 mt-1">
            ${metrics.totalCOGS?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">Frozen historical batch cost</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Gross Profit</span>
          <div className="text-2xl font-extrabold text-emerald-400 mt-1">
            ${metrics.grossProfit?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-emerald-400 font-semibold mt-1">
            {metrics.grossMarginPercentage}% Gross Margin
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <span className="text-xs font-semibold uppercase text-slate-500 block">Net Contribution</span>
          <div className="text-2xl font-extrabold text-blue-400 mt-1">
            ${metrics.netContribution?.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-blue-400 font-semibold mt-1">
            {metrics.netMarginPercentage}% Net Margin
          </div>
        </div>
      </div>

      {/* Tab 1: Overview & Charts */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 mb-4">
              30-Day Revenue vs Gross Profit Curve
            </h2>
            <div className="h-72 w-full">
              {trendsData && trendsData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="date" stroke="#64748b" fontSize={11} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={11} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '12px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#22c55e"
                      strokeWidth={2}
                      fill="#22c55e"
                      fillOpacity={0.15}
                      name="Revenue ($)"
                    />
                    <Area
                      type="monotone"
                      dataKey="profit"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="#3b82f6"
                      fillOpacity={0.15}
                      name="Gross Profit ($)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                  Awaiting order transaction entries to render trend analysis.
                </div>
              )}
            </div>
          </div>

          {/* Granular Cost Ledger Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                Marketplace Platform Fees
              </span>
              <div className="text-xl font-bold text-white">
                ${metrics.totalMarketplaceFees?.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Shopify and eBay take-rates</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                Payment Gateway Fees
              </span>
              <div className="text-xl font-bold text-white">
                ${metrics.totalPaymentFees?.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Stripe, PayPal, Shopify Payments</p>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
              <span className="text-xs font-semibold text-slate-400 block mb-1">
                Outbound Shipping Expenses
              </span>
              <div className="text-xl font-bold text-white">
                ${metrics.totalShippingExpenses?.toFixed(2)}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">Postage & carrier label costs</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Product Breakdown */}
      {activeTab === 'products' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Product-Level Profitability & Loss Identification
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">SKU</th>
                  <th className="py-3 px-4">Product Name</th>
                  <th className="py-3 px-4 text-center">Units Sold</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">COGS</th>
                  <th className="py-3 px-4 text-right">Gross Profit</th>
                  <th className="py-3 px-4 text-right">Gross Margin</th>
                  <th className="py-3 px-4 text-center">Health</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {productsLoading ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      Calculating product profitability metrics...
                    </td>
                  </tr>
                ) : productsData && productsData.length > 0 ? (
                  productsData.map((p: any) => (
                    <tr key={p.sku} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-brand-400">{p.sku}</td>
                      <td className="py-3.5 px-4 font-semibold text-slate-200">{p.title}</td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-white">
                        {p.unitsSold}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">
                        ${p.revenue?.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        ${p.cogs?.toFixed(2)}
                      </td>
                      <td
                        className={`py-3.5 px-4 text-right font-mono font-bold ${
                          p.grossProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        ${p.grossProfit?.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-semibold text-slate-300">
                        {p.grossMargin}%
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {p.isLossMaking ? (
                          <span className="bg-red-950 text-red-400 border border-red-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                            Loss-Making
                          </span>
                        ) : (
                          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800/60 px-2 py-0.5 rounded text-[10px] font-bold">
                            Profitable
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No order line history recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Channel Contribution */}
      {activeTab === 'channels' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300">
              Channel Profitability Breakdown
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Sales Channel</th>
                  <th className="py-3 px-4">Platform Type</th>
                  <th className="py-3 px-4 text-center">Total Orders</th>
                  <th className="py-3 px-4 text-right">Revenue</th>
                  <th className="py-3 px-4 text-right">COGS</th>
                  <th className="py-3 px-4 text-right">Marketplace Fees</th>
                  <th className="py-3 px-4 text-right">Net Contribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {channelsLoading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading channel metrics...
                    </td>
                  </tr>
                ) : channelsData && channelsData.length > 0 ? (
                  channelsData.map((ch: any) => (
                    <tr key={ch.channelId} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-white">{ch.channelName}</td>
                      <td className="py-3.5 px-4">
                        <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                          {ch.channelType}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono font-bold text-slate-200">
                        {ch.orderCount}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-white">
                        ${ch.revenue?.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-slate-400">
                        ${ch.cogs?.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono text-amber-400">
                        ${ch.fees?.toFixed(2)}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-blue-400 text-sm">
                        ${ch.netContribution?.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No channels recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
