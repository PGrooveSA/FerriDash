/** @type {import('next').NextConfig} */
const nextConfig = {
  // Uploads: profile photos and logos are resized in the browser; expense PDFs may be up to 10 MB.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  // node:sqlite is a Node built-in; keep it out of the bundle.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), { "node:sqlite": "commonjs node:sqlite" }];
    }
    return config;
  },
};
export default nextConfig;
