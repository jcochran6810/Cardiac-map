import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CardioSim — Cardiac Education, Simulation & Training Platform',
  description: 'A comprehensive browser-first cardiac education platform featuring interactive 3D anatomy, ECG simulation, hemodynamics, conditions, pharmacology, procedures, and AI-powered tutoring.',
  keywords: ['cardiac', 'heart', 'education', 'simulation', 'ECG', 'anatomy', '3D', 'medical'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>♥</text></svg>" />
      </head>
      <body className="h-screen overflow-hidden bg-cardiac-dark text-slate-200 antialiased">
        {children}
      </body>
    </html>
  );
}
