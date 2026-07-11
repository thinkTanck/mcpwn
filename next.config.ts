import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail production builds on type errors. (Next 16 no longer runs ESLint during
  // build — lint is a dedicated CI step; see .github/workflows/ci.yml.)
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
