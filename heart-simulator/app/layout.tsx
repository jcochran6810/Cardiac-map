import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CardioSim — Cardiac Education, Simulation & Training Platform',
  description: 'A comprehensive browser-first cardiac education platform featuring interactive 3D anatomy, ECG simulation, hemodynamics, conditions, pharmacology, procedures, and AI-powered tutoring.',
  keywords: ['cardiac', 'heart', 'education', 'simulation', 'ECG', 'anatomy', '3D', 'medical'],
  applicationName: 'CardioSim',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'CardioSim',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }],
    apple: '/icons/apple-touch-icon.png',
  },
};

// Phone-friendly viewport: fill the screen edge to edge (safe areas handled in
// CSS), keep the dark theme colour in the browser chrome.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0F172A',
  colorScheme: 'dark',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen overflow-hidden bg-cardiac-dark text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
