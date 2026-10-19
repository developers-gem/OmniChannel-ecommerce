'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Share2,
  Package,
  PlusCircle,
  GitMerge,
  Boxes,
  ShoppingCart,
  FileSpreadsheet,
  TrendingUp,
  RefreshCw,
  Bell,
  Users,
  Settings,
  ChevronRight,
  Layers,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Channel Integrations', href: '/channels', icon: Share2 },
  { name: 'All Products', href: '/products', icon: Package },
  { name: 'Add Product', href: '/products/new', icon: PlusCircle },
  { name: 'Product Mapping', href: '/mappings', icon: GitMerge },
  { name: 'Inventory', href: '/inventory', icon: Boxes },
  { name: 'Orders', href: '/orders', icon: ShoppingCart },
  { name: 'CSV Import / Export', href: '/csv', icon: FileSpreadsheet },
  { name: 'Profit & Loss', href: '/pnl', icon: TrendingUp },
  { name: 'Sync Jobs', href: '/sync-jobs', icon: RefreshCw },
  { name: 'Notifications', href: '/notifications', icon: Bell },
  { name: 'Team & Permissions', href: '/teams', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Platform Branding */}
      <div className="h-16 flex items-center px-6 border-b border-slate-800 gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Layers className="w-5 h-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-base tracking-tight text-white block">OmniChannel</span>
          <span className="text-[10px] text-slate-400 tracking-wider font-semibold uppercase block">
            Commerce Hub
          </span>
        </div>
      </div>

      {/* Nav List */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-brand-600 text-white shadow-md shadow-brand-600/30 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span>{item.name}</span>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-80" />}
            </Link>
          );
        })}
      </nav>

      {/* Bottom system status indicator */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-900/50">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Cluster Healthy</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">v1.0.0</span>
        </div>
      </div>
    </aside>
  );
}
