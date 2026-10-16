import type { Config } from 'tailwindcss';
import defaultTheme from 'tailwindcss/defaultTheme';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    // `xs` must come first so min-width breakpoints stay sorted smallest → largest
    screens: { xs: '390px', ...defaultTheme.screens },
    extend: {
      colors: {
        ui: {
          background: 'rgb(var(--ui-bg) / <alpha-value>)',
          panel: 'rgb(var(--ui-panel) / <alpha-value>)',
          raised: 'rgb(var(--ui-raised) / <alpha-value>)',
          text: 'rgb(var(--ui-text) / <alpha-value>)',
          muted: 'rgb(var(--ui-muted) / <alpha-value>)',
          border: 'rgb(var(--ui-border) / <alpha-value>)',
          focus: 'rgb(var(--ui-focus) / <alpha-value>)',
        },
        cardiac: {
          red: '#DC2626',
          blue: '#2563EB',
          dark: '#0F172A',
          panel: '#1E293B',
          surface: '#334155',
          accent: '#F59E0B',
          success: '#10B981',
          warning: '#F59E0B',
          danger: '#EF4444',
          oxygenated: '#EF4444',
          deoxygenated: '#3B82F6',
          conduction: '#FBBF24',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-left': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-in-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'slide-in-left': 'slide-in-left 180ms ease-out',
        'slide-in-right': 'slide-in-right 180ms ease-out',
        'slide-in-up': 'slide-in-up 200ms ease-out',
      },
    },
  },
  plugins: [
    plugin(({ addVariant }) => {
      // Finger-driven devices (phones, tablets): bigger tap targets
      addVariant('touch', '@media (hover: none) and (pointer: coarse)');
      // Phone-sized screens in either orientation — keep in sync with PHONE_QUERY in src/lib/device.ts
      addVariant('phone', '@media (max-width: 639px), (max-height: 500px)');
      // Short landscape screens (phones on their side)
      addVariant('short', '@media (max-height: 500px)');
    }),
  ],
};

export default config;
