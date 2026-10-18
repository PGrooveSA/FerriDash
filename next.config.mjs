/** @type {import('next').NextConfig} */
const nextConfig = {
  // Profile photos are resized in the browser, but allow some headroom for uploads.
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // node:sqlite is a Node built-in; keep it out of the bundle.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), { "node:sqlite": "commonjs node:sqlite" }];
    }
    return config;
  },
};
export default nextConfig;
