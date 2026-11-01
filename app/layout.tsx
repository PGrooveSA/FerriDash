import type { Metadata } from "next";
import "./globals.css";
import { Inter, Manrope, Outfit, Plus_Jakarta_Sans, Poppins, Urbanist } from "next/font/google";
import DeviceLink from "@/components/DeviceLink";

// Theme fonts (lib/themes.ts), self-hosted by Next. Not preloaded: a browser only downloads the one its theme uses.
const urbanist = Urbanist({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-urbanist" });
const inter = Inter({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-inter" });
const poppins = Poppins({ subsets: ["latin"], display: "swap", preload: false, weight: ["300", "400", "500", "600", "700"], variable: "--font-poppins" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-jakarta" });
const manrope = Manrope({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-manrope" });
const outfit = Outfit({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-outfit" });
const fontVars = [urbanist, inter, poppins, jakarta, manrope, outfit].map((f) => f.variable).join(" ");

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
