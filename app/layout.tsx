import type { Metadata } from "next";
import "./globals.css";
import { Lato } from "next/font/google";
import DeviceLink from "@/components/DeviceLink";

// FerriDash uses Lato everywhere (every theme), self-hosted by Next. Lato has no 500/600 weights:
// browsers show font-medium as regular and font-semibold as bold.
const lato = Lato({ subsets: ["latin"], display: "swap", weight: ["300", "400", "700", "900"], variable: "--font-lato" });
const fontVars = lato.variable;

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
