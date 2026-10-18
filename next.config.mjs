/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a Node built-in; keep it out of the bundle.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), { "node:sqlite": "commonjs node:sqlite" }];
    }
    return config;
  },
};
export default nextConfig;
