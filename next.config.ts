import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Fail production builds on type errors. (Next 16 no longer runs ESLint during
  // build — lint is a dedicated CI step; see .github/workflows/ci.yml.)
  typescript: { ignoreBuildErrors: false },
  // The dev indicator defaults to bottom-left, exactly where the command deck's
  // FLEET STATUS cluster sits — it occludes the caution/breach labels in every
  // dev screenshot and review (it never ships to production). Move it clear.
  devIndicators: { position: 'bottom-right' },
};

export default nextConfig;
