import { create } from 'zustand';

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  flag: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyOption[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar', flag: '🇺🇸', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', flag: '🇬🇧', decimals: 2 },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', flag: '🇮🇳', decimals: 2 },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', flag: '🇨🇦', decimals: 2 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', flag: '🇦🇺', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', flag: '🇯🇵', decimals: 0 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', flag: '🇸🇬', decimals: 2 },
  { code: 'AED', symbol: 'AED', name: 'UAE Dirham', flag: '🇦🇪', decimals: 2 },
];

export function getCurrencyInfo(code?: string): CurrencyOption {
  const normalized = (code || 'USD').toUpperCase().trim();
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === normalized);
  return (
    found || {
      code: normalized,
      symbol: '$',
      name: normalized,
      flag: '🌐',
      decimals: 2,
    }
  );
}

interface CurrencyState {
  currency: string;
  symbol: string;
  setCurrency: (code: string) => void;
  initializeCurrency: (serverCode?: string) => void;
}

export const useCurrencyStore = create<CurrencyState>((set) => ({
  currency: 'USD',
  symbol: '$',

  setCurrency: (code: string) => {
    const info = getCurrencyInfo(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnichannel_currency', info.code);
    }
    set({
      currency: info.code,
      symbol: info.symbol,
    });
  },

  initializeCurrency: (serverCode?: string) => {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('omnichannel_currency');
      const targetCode = serverCode || local || 'USD';
      const info = getCurrencyInfo(targetCode);
      set({
        currency: info.code,
        symbol: info.symbol,
      });
    } else if (serverCode) {
      const info = getCurrencyInfo(serverCode);
      set({
        currency: info.code,
        symbol: info.symbol,
      });
    }
  },
}));

/**
 * React Hook for formatting currency anywhere in the application
 */
export function useCurrency() {
  const currency = useCurrencyStore((s) => s.currency);
  const symbol = useCurrencyStore((s) => s.symbol);
  const setCurrency = useCurrencyStore((s) => s.setCurrency);

  const format = (amount: number | string | undefined | null): string => {
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return `${symbol}0.00`;
    }
    const num = Number(amount);
    const info = getCurrencyInfo(currency);
    const formattedNum = num.toLocaleString('en-US', {
      minimumFractionDigits: info.decimals,
      maximumFractionDigits: info.decimals,
    });

    // For AED or multi-character codes, place with space e.g. "AED 120.00"
    if (info.symbol.length > 2) {
      return `${info.symbol} ${formattedNum}`;
    }
    return `${info.symbol}${formattedNum}`;
  };

  return {
    currency,
    symbol,
    setCurrency,
    format,
  };
}
