/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:4100";

const nextConfig = {
  transpilePackages: ["@fable/shared"],
  async rewrites() {
    // Same-origin proxy to the Express API → cookies work with zero CORS fuss.
    return [
      { source: "/api/v1/:path*", destination: `${API_URL}/api/v1/:path*` },
      { source: "/files/:path*", destination: `${API_URL}/files/:path*` },
    ];
  },
};

export default nextConfig;
