'use client';

import React, { useEffect, useState } from 'react';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from '@/lib/store';
import { useThemeStore } from '@/lib/theme';
import { useCurrencyStore } from '@/lib/currency';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 1000 * 30, // 30 seconds
          },
        },
      })
  );

  const initializeAuth = useAuthStore((s) => s.initialize);
  const initializeTheme = useThemeStore((s) => s.initializeTheme);
  const initializeCurrency = useCurrencyStore((s) => s.initializeCurrency);

  useEffect(() => {
    initializeAuth();
    initializeTheme();
    initializeCurrency();
  }, [initializeAuth, initializeTheme, initializeCurrency]);

  return (
    <html lang="en" className="dark" data-theme="emerald" suppressHydrationWarning>
      <head>
        <title>OmniChannel Platform — Multi-Store Centralized Hub</title>
        <meta
          name="description"
          content="Centralized multichannel ecommerce management platform for Shopify, eBay, and Custom REST stores."
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('omnichannel_theme')||'emerald';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-slate-950 text-slate-100 min-h-screen font-sans antialiased">
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </body>
    </html>
  );
}
