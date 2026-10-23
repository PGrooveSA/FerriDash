import type { MetadataRoute } from "next";

// Lets FerriDash be added to a phone or computer home screen with its own icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FerriDash",
    short_name: "FerriDash",
    description: "School management for South African schools - CAPS results, reports, attendance and finance.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0F172A",
    theme_color: "#F4600C",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
