// Browser security rules for every page. Scripts and styles come only from FerriDash itself ('unsafe-inline' is
// needed by Next.js's own inline scripts and the theme script). Message pictures and direct uploads go to
// Supabase Storage. No other site may show FerriDash in a frame (clickjacking).
const dev = process.env.NODE_ENV !== "production";
const storage = "https://*.supabase.co";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${storage}`,
  "font-src 'self' data:",
  `connect-src 'self' ${storage}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
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
