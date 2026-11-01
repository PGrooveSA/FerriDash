"use client";
import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

/** The school's public application link, with copy and open buttons. */
export default function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
      <input readOnly value={url} className="input flex-1 min-w-[14rem] font-mono text-sm" onFocus={(e) => e.currentTarget.select()} aria-label="Application link" />
      <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
        <Copy className="w-3.5 h-3.5" />{copied ? "Copied" : "Copy link"}
      </button>
      <a href={url} target="_blank" rel="noopener" className="btn btn-ghost btn-sm"><ExternalLink className="w-3.5 h-3.5" />Open</a>
    </div>
  );
}
