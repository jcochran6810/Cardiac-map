import type { MetadataRoute } from 'next';

/** Web app manifest so the simulator can be installed to a phone home screen. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CardioSim — Cardiac Simulator',
    short_name: 'CardioSim',
    description: 'Interactive 3D heart, 12-lead ECG, hemodynamics and cardiac education.',
    start_url: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0F172A',
    theme_color: '#0F172A',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
