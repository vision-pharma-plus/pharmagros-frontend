/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone output keeps the production image small: Next traces only the
  // modules actually reachable at runtime rather than shipping node_modules.
  output: "standalone",

  async headers() {
    // Nginx sets these too, but a request that reaches Next directly (a
    // misrouted health check, a container probe) should still be hardened.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
