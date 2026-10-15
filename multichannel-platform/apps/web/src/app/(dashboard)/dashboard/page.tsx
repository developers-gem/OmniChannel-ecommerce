'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
  Package,
  Boxes,
  ShoppingCart,
  TrendingUp,
  Share2,
  AlertTriangle,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

export default function DashboardPage() {
  const { data: metricsData, isLoading: metricsLoading } = useQuery({
    queryKey: ['dashboard-metrics'],
    queryFn: async () => {
      const res: any = await api.get('/dashboard/metrics');
      return res.data;
    },
  });

  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: ['pnl-trends'],
    queryFn: async () => {
      const res: any = await api.get('/pnl/trends?days=14');
      return res.data;
    },
  });

  const catalog = metricsData?.catalog || { totalProducts: 0, totalListings: 0, totalMapped: 0, mappingPercentage: 0 };
  const inventory = metricsData?.inventory || { totalStockOnHand: 0, lowStockCount: 0 };
  const sales = metricsData?.sales || { orders24h: 0, revenue24h: 0, orders30d: 0, revenue30d: 0 };
  const recentOrders = metricsData?.recentOrders || [];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Operations Command Center</h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time synchronization metrics across all connected sales channels
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/channels"
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl border border-slate-700 transition"
          >
            <Share2 className="w-3.5 h-3.5 text-brand-400" />
            <span>Manage Channels</span>
          </Link>
          <Link
            href="/products/new"
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl shadow-lg shadow-brand-600/30 transition"
          >
            <span>Add New Product</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">30-Day Revenue</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">
            ${sales.revenue30d?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-emerald-400 font-semibold">{sales.orders30d} orders</span>
            <span>in last 30 days</span>
          </div>
        </div>

        {/* 24h Orders */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Today's Orders</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <ShoppingCart className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{sales.orders24h}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-blue-400 font-semibold">${sales.revenue24h?.toFixed(2)}</span>
            <span>gross sales today</span>
          </div>
        </div>

        {/* Canonical Catalog */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Canonical Catalog</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{catalog.totalProducts}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            <span className="text-purple-400 font-semibold">{catalog.mappingPercentage}%</span>
            <span>channel listing mapped</span>
          </div>
        </div>

        {/* Inventory Stock */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider">Stock On Hand</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-white">{inventory.totalStockOnHand}</div>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
            {inventory.lowStockCount > 0 ? (
              <span className="text-amber-400 font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {inventory.lowStockCount} items low stock
              </span>
            ) : (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Stock levels optimal
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Revenue & Profit Trends Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Sales & Gross Profit Trajectory</h2>
            <p className="text-xs text-slate-400 mt-0.5">14-day chronological performance timeline</p>
          </div>
          <Link
            href="/pnl"
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <span>View Full PnL</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="h-64 w-full">
          {trendsLoading ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              Loading sales chart...
            </div>
          ) : trendsData && trendsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trendsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                  name="Revenue ($)"
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorProfit)"
                  name="Gross Profit ($)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
              <TrendingUp className="w-8 h-8 text-slate-700 mb-2" />
              <span>No order transaction data recorded in this period yet.</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Recent Customer Orders</h2>
            <p className="text-xs text-slate-400 mt-0.5">Centralized order stream across all connected stores</p>
          </div>
          <Link
            href="/orders"
            className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
          >
            <span>View All Orders</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4 rounded-l-xl">Order #</th>
                <th className="py-3 px-4">Sales Channel</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Fulfillment</th>
                <th className="py-3 px-4 text-right rounded-r-xl">Total Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {recentOrders.length > 0 ? (
                recentOrders.map((o: any) => (
                  <tr key={o._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-200">
                      <Link href={`/orders`} className="hover:text-brand-400 underline">
                        {o.orderNumber}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-semibold">
                        {o.channelType}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{o.customer?.name || 'Customer'}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.financialStatus === 'PAID'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                            : 'bg-amber-950 text-amber-400 border border-amber-800/60'
                        }`}
                      >
                        {o.financialStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.fulfillmentStatus === 'FULFILLED'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {o.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-white">
                      ${o.totalPrice?.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No orders have been synchronized yet. Connect a channel or import CSV orders.
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
