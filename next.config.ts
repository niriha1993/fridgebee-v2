import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Marketing landing page — serves the static HTML file at public/welcome.html
      // when someone visits /welcome. Keeps the marketing design fully isolated from
      // the React app (no JSX conversion needed) and runs at static-asset speed.
      { source: '/welcome', destination: '/welcome.html' },
    ];
  },
};

export default nextConfig;
