import type { Metadata } from "next";
import "./globals.css";
import { Sora, Source_Serif_4 } from "next/font/google";
import DeviceLink from "@/components/DeviceLink";

// FerriDash fonts (every theme), self-hosted by Next: Sora for the interface (menus, buttons, forms, tables, numbers);
// Source Serif 4 for headings and the legal pages' text. Both are variable fonts.
const sora = Sora({ subsets: ["latin"], display: "swap", variable: "--font-sora" });
const serif = Source_Serif_4({ subsets: ["latin"], display: "swap", style: ["normal", "italic"], variable: "--font-source-serif" });
const fontVars = `${sora.variable} ${serif.variable}`;

export const metadata: Metadata = {
  title: { default: "FerriDash", template: "%s · FerriDash" },
  description: "School management for South African schools - CAPS results, reports, attendance and finance.",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/favicon-32.png", sizes: "32x32", type: "image/png" }], apple: "/apple-icon.png" },
};

// Applies the saved theme before paint to avoid a flash.
const themeScript = `try{var t=localStorage.getItem('sh-theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-ZA" className={fontVars} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <div className="mesh" aria-hidden>
          <div className="blob blob-a" style={{ top: "-6rem", left: "-4rem" }} />
          <div className="blob blob-b" style={{ top: "30%", right: "-8rem", animationDelay: "-8s" }} />
          <div className="blob blob-c" style={{ bottom: "-8rem", left: "35%", animationDelay: "-16s" }} />
        </div>
        {children}
        <DeviceLink />
      </body>
    </html>
  );
}
