import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CardioSim — Interactive Cardiac Anatomy, ECG & Physiology',
  description:
    'Interactive 3D heart with a synchronised 12-lead ECG, conduction system, Wiggers diagram and pressure-volume loop, plus a reviewed library of cardiac anatomy, conditions, procedures and drugs for EMS, acute care and cardiology learners.',
  keywords: ['cardiac', 'heart', 'education', 'simulation', 'ECG', 'EKG', 'anatomy', '3D', 'paramedic', 'cardiology'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0F172A',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>♥</text></svg>" />
      </head>
      <body className="h-screen overflow-hidden bg-cardiac-dark text-slate-200 antialiased">{children}</body>
    </html>
  );
}
