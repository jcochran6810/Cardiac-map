/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['three'],
  // The production build type-checks the app only; tests (which need the devDependency vitest)
  // are type-checked by `npm run typecheck`.
  typescript: { tsconfigPath: 'tsconfig.build.json' },
  env: {
    // Versions the offline cache (public/sw.js): each release replaces the previous one
    NEXT_PUBLIC_BUILD_ID: (process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now())).slice(0, 12),
  },
  async headers() {
    return [
      // Phones must always re-check the service worker so app updates arrive
      { source: '/sw.js', headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }] },
    ];
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.glb$/,
      type: 'asset/resource',
    });
    return config;
  },
};

module.exports = nextConfig;
