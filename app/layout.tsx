import type { Metadata } from "next";
import "./globals.css";
import DeviceLink from "@/components/DeviceLink";

export const metadata: Metadata = {
  title: { default: "FerriDash", template: "%s · FerriDash" },
  description: "School management for South African schools - CAPS results, reports, attendance and finance.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-icon.png" },
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('sh-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="mesh" aria-hidden>
          <div className="blob" style={{ background: "#ffa86d", top: "-6rem", left: "-4rem" }} />
          <div className="blob" style={{ background: "#7dd3fc", top: "30%", right: "-8rem", animationDelay: "-8s" }} />
          <div className="blob" style={{ background: "#86efac", bottom: "-8rem", left: "35%", animationDelay: "-16s" }} />
        </div>
        {children}
        <DeviceLink />
      </body>
    </html>
  );
}
