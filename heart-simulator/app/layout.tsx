import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaInit } from '@/components/ui/InstallApp';

export const metadata: Metadata = {
  title: 'CardioSim — Interactive Cardiac Anatomy, ECG & Physiology',
  description:
    'Interactive 3D heart with a synchronised 12-lead ECG, conduction system, Wiggers diagram and pressure-volume loop, plus a reviewed library of cardiac anatomy, conditions, procedures and drugs for EMS, acute care and cardiology learners.',
  keywords: ['cardiac', 'heart', 'education', 'simulation', 'ECG', 'EKG', 'anatomy', '3D', 'paramedic', 'cardiology'],
  applicationName: 'CardioSim',
  manifest: '/manifest.webmanifest',
  // Installed on an iPhone / iPad home screen: open full screen with the app's own name
  appleWebApp: { capable: true, title: 'CardioSim', statusBarStyle: 'black' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="h-screen overflow-hidden bg-cardiac-dark text-slate-200 antialiased">
        <PwaInit />
        {children}
      </body>
    </html>
  );
}
