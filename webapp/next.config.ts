import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias["pino-pretty"] = false;
    return config;
  },
};

export default nextConfig;
