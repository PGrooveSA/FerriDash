/** @type {import('next').NextConfig} */
const nextConfig = {
  // Uploads: profile photos and logos are resized in the browser; expense PDFs may be up to 4 MB
  // (Vercel accepts request bodies up to 4.5 MB).
  experimental: { serverActions: { bodySizeLimit: "4.5mb" } },
  // Files read at run time, which serverless hosts (Vercel) only ship when listed here.
  outputFileTracingIncludes: {
    "/**": ["./db/schema.pg.sql"],
    "/api/import-template/[name]": ["./templates/import/**"],
  },
};
export default nextConfig;
