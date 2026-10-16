import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
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
    },
  },
  plugins: [],
};

export default config;
