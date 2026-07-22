import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ['www.einpresswire.com','hebbkx1anhila5yf.public.blob.vercel-storage.com'],
  },

};

export default nextConfig;

