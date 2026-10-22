import { create } from 'zustand';

export type ThemeId = 'emerald' | 'sapphire' | 'amethyst' | 'amber' | 'aidemy' | 'shopify' | 'midnight';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  tagline: string;
  badge: string;
  description: string;
  accentHex: string;
  isLight?: boolean;
  previewColors: {
    bg: string;
    card: string;
    primary: string;
    border: string;
  };
}

export const THEMES: ThemeOption[] = [
  {
    id: 'emerald',
    name: 'Emerald Obsidian',
    tagline: 'Default • Fintech & Commerce',
    badge: 'Classic Pro',
    description: 'Deep obsidian charcoal with vibrant emerald neon accents. High contrast and razor-sharp clarity.',
    accentHex: '#22c55e',
    previewColors: {
      bg: '#020617',
      card: '#0f172a',
      primary: '#22c55e',
      border: '#1e293b',
    },
  },
  {
    id: 'sapphire',
    name: 'Sapphire Horizon',
    tagline: 'Modern • High-Tech Command',
    badge: 'Popular',
    description: 'Midnight navy surfaces with electric sapphire & cyan accents. Inspired by modern developer platforms.',
    accentHex: '#3b82f6',
    previewColors: {
      bg: '#050b1a',
      card: '#0b152c',
      primary: '#3b82f6',
      border: '#1a2c56',
    },
  },
  {
    id: 'amethyst',
    name: 'Cosmic Amethyst',
    tagline: 'Futuristic • Royal Nebula',
    badge: 'Luxury',
    description: 'Deep space purple backgrounds paired with radiant violet & amethyst accents. Ultra-modern and immersive.',
    accentHex: '#a855f7',
    previewColors: {
      bg: '#0b0816',
      card: '#140f26',
      primary: '#a855f7',
      border: '#2d2350',
    },
  },
  {
    id: 'amber',
    name: 'Sunset Amber',
    tagline: 'Warm • Titanium Executive',
    badge: 'Warm Dark',
    description: 'Rich dark espresso charcoal contrasted with warm radiant gold and amber accents for executive workspaces.',
    accentHex: '#f59e0b',
    previewColors: {
      bg: '#100d0a',
      card: '#1a1510',
      primary: '#f59e0b',
      border: '#362c23',
    },
  },
  {
    id: 'aidemy',
    name: 'Aidemy AI',
    tagline: 'Modern Light • Lavender & Amber Glow',
    badge: 'Featured AI',
    description: 'Crisp light canvas with radiant violet, lavender aura, and warm sunset amber accents from the Aidemy design.',
    accentHex: '#9333ea',
    isLight: true,
    previewColors: {
      bg: '#fbf9fd',
      card: '#ffffff',
      primary: '#9333ea',
      border: '#e9d5ff',
    },
  },
  {
    id: 'shopify',
    name: 'Shopify Polaris',
    tagline: 'Clean Commerce • Official Polaris Admin',
    badge: 'Merchant Pro',
    description: 'Iconic Shopify admin palette with a dark header bar, light grey sidebar, pure white cards, and Polaris green accents.',
    accentHex: '#008060',
    isLight: true,
    previewColors: {
      bg: '#f6f6f7',
      card: '#ffffff',
      primary: '#008060',
      border: '#e1e3e5',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight OLED',
    tagline: 'Ultra Night • True Pitch Black & Cyan',
    badge: 'Deep Night',
    description: 'True pitch black OLED canvas for zero eye fatigue and infinite contrast, paired with electric cyber cyan neon.',
    accentHex: '#06b6d4',
    previewColors: {
      bg: '#000000',
      card: '#080a0e',
      primary: '#06b6d4',
      border: '#181e28',
    },
  },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
  initializeTheme: () => void;
}

const applyThemeToDOM = (theme: ThemeId) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  if (theme === 'aidemy' || theme === 'shopify') {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  }
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: 'emerald',
  setTheme: (theme) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('omnichannel_theme', theme);
      applyThemeToDOM(theme);
    }
    set({ theme });
  },
  initializeTheme: () => {
    if (typeof window !== 'undefined') {
      const saved = (localStorage.getItem('omnichannel_theme') as ThemeId) || 'emerald';
      applyThemeToDOM(saved);
      set({ theme: saved });
    }
  },
}));
