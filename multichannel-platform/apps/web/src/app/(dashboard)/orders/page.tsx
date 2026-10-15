'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  ShoppingCart,
  Search,
  Filter,
  Truck,
  XCircle,
  Eye,
  CheckCircle2,
  Clock,
  Package,
} from 'lucide-react';

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [fulfillModalOrder, setFulfillModalOrder] = useState<any | null>(null);
  const [trackingCompany, setTrackingCompany] = useState('USPS');
  const [trackingNumber, setTrackingNumber] = useState('');

  const { data: orderResponse, isLoading } = useQuery({
    queryKey: ['orders-list', search, channelFilter, statusFilter],
    queryFn: async () => {
      let url = '/orders?limit=25';
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (channelFilter) url += `&channelType=${channelFilter}`;
      if (statusFilter) url += `&fulfillmentStatus=${statusFilter}`;
      const res: any = await api.get(url);
      return res;
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async ({ id, payload }: any) => {
      const res: any = await api.post(`/orders/${id}/fulfill`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      setFulfillModalOrder(null);
      setTrackingNumber('');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res: any = await api.post(`/orders/${id}/cancel`, { reason: 'Merchant initiated' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders-list'] });
      setSelectedOrder(null);
    },
  });

  const orders = orderResponse?.data || [];

  const handleOpenFulfill = (order: any) => {
    setFulfillModalOrder(order);
    setTrackingNumber(`9400${Math.floor(100000000000 + Math.random() * 900000000000)}`);
  };

  const handleFulfillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fulfillModalOrder) return;
    fulfillMutation.mutate({
      id: fulfillModalOrder._id,
      payload: {
        trackingCompany,
        trackingNumber,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Centralized Orders</h1>
          <p className="text-xs text-slate-400 mt-1">
            Multi-channel sales pipeline, line-item historical costs, and fulfillment tracking
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between shadow-lg">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order #, customer, email..."
            className="w-full px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs pl-9 focus:ring-2 focus:ring-brand-500 outline-none"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs outline-none"
          >
            <option value="">All Channels</option>
            <option value="SHOPIFY">Shopify</option>
            <option value="EBAY">eBay</option>
            <option value="CUSTOM_STORE">Custom Store</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs outline-none"
          >
            <option value="">All Fulfillments</option>
            <option value="UNFULFILLED">Unfulfilled</option>
            <option value="FULFILLED">Fulfilled</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Channel</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Date Placed</th>
                <th className="py-3 px-4 text-center">Items</th>
                <th className="py-3 px-4 text-center">Payment</th>
                <th className="py-3 px-4 text-center">Fulfillment</th>
                <th className="py-3 px-4 text-right">Order Total</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    Loading orders...
                  </td>
                </tr>
              ) : orders.length > 0 ? (
                orders.map((o: any) => (
                  <tr key={o._id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-white">
                      <button
                        onClick={() => setSelectedOrder(o)}
                        className="hover:text-brand-400 underline"
                      >
                        {o.orderNumber}
                      </button>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="bg-slate-800 text-slate-300 px-2 py-0.5 rounded text-[10px] font-bold">
                        {o.channelType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">
                        {o.customer?.name || 'Customer'}
                      </div>
                      <span className="text-[10px] text-slate-500">{o.customer?.email}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono text-[11px]">
                      {new Date(o.placedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-center font-semibold text-slate-300">
                      {o.itemCount || o.lines?.length || 1}
                    </td>
                    <td className="py-3.5 px-4 text-center">
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
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.fulfillmentStatus === 'FULFILLED'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                            : o.fulfillmentStatus === 'CANCELLED'
                            ? 'bg-red-950 text-red-400 border border-red-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {o.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-white">
                      ${o.totalPrice?.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setSelectedOrder(o)}
                          title="View Details"
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {o.fulfillmentStatus === 'UNFULFILLED' && (
                          <button
                            onClick={() => handleOpenFulfill(o)}
                            title="Fulfill Order"
                            className="p-1.5 text-brand-400 hover:text-brand-300 hover:bg-slate-800 rounded-lg transition"
                          >
                            <Truck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No orders matching criteria found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Details Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  Order Details: {selectedOrder.orderNumber}
                </h2>
                <span className="text-[10px] font-mono text-slate-400">
                  External ID: {selectedOrder.externalOrderId} &bull; Channel:{' '}
                  {selectedOrder.channelType}
                </span>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Line Items */}
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
                Order Items & Frozen COGS
              </h3>
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                {selectedOrder.lines?.map((line: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-850 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">{line.title}</div>
                      <span className="font-mono text-[10px] text-slate-400">
                        SKU: {line.sku} &bull; Qty: {line.quantity}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-white">${(line.unitPrice * line.quantity).toFixed(2)}</div>
                      <span className="text-[10px] text-slate-500">
                        Historical Cost: ${line.unitCost?.toFixed(2)} / unit
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial summary */}
            <div className="mt-4 p-3.5 bg-slate-800/40 rounded-xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal</span>
                <span>${selectedOrder.subtotalPrice?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Channel Marketplace Fee</span>
                <span>-${selectedOrder.channelFee?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-white pt-2 border-t border-slate-700">
                <span>Total Paid</span>
                <span>${selectedOrder.totalPrice?.toFixed(2)}</span>
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between">
              {selectedOrder.fulfillmentStatus !== 'CANCELLED' && (
                <button
                  onClick={() => cancelMutation.mutate(selectedOrder._id)}
                  disabled={cancelMutation.isPending}
                  className="text-xs font-semibold text-red-400 hover:text-red-300"
                >
                  Cancel Order & Release Stock
                </button>
              )}
              <button
                onClick={() => setSelectedOrder(null)}
                className="ml-auto bg-slate-800 hover:bg-slate-700 text-white text-xs px-4 py-2 rounded-xl transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fulfill Modal */}
      {fulfillModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h2 className="text-base font-bold text-white">Fulfill Order</h2>
            <p className="text-xs text-slate-400 mt-0.5 mb-4">
              Order {fulfillModalOrder.orderNumber} ({fulfillModalOrder.customer?.name})
            </p>

            <form onSubmit={handleFulfillSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Carrier / Shipping Company
                </label>
                <select
                  value={trackingCompany}
                  onChange={(e) => setTrackingCompany(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs outline-none"
                >
                  <option value="USPS">USPS</option>
                  <option value="UPS">UPS</option>
                  <option value="FedEx">FedEx</option>
                  <option value="DHL">DHL Express</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase">
                  Tracking Number
                </label>
                <input
                  type="text"
                  required
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  className="mt-1 w-full px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-xs font-mono outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setFulfillModalOrder(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={fulfillMutation.isPending}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-brand-600/30"
                >
                  {fulfillMutation.isPending ? 'Fulfilling...' : 'Mark as Shipped'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
