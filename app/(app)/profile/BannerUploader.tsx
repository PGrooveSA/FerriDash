"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { uploadBanner, removeBanner } from "@/app/actions/people";
import { bannerStyle } from "@/components/ui/banner";

const MAX_W = 1800; // stored banner is at most 1800 px wide and no taller than half its width

/** Scales the picked image down and crops it to a wide strip (WebP, JPEG fallback). */
async function toBanner(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That file isn't an image this browser can read."); });
  const srcH = Math.min(bitmap.height, Math.round(bitmap.width / 2));
  const w = Math.min(MAX_W, bitmap.width), h = Math.round((srcH / bitmap.width) * w);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, (bitmap.height - srcH) / 2, bitmap.width, srcH, 0, 0, w, h);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.85));
  const webp = await encode("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await encode("image/jpeg");
  if (!blob) throw new Error("Could not process that picture.");
  return blob;
}

/** The banner across the top of the profile page, with buttons to add, change or remove it. */
export default function BannerUploader({ banner, children }: { banner: string | null; children?: React.ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const shown = preview ?? banner;

  const handle = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Please choose a JPG, PNG or WebP image.");
    if (file.size > 20 * 1024 * 1024) return setError("That file is very large. Please choose a picture under 20 MB.");
    start(async () => {
      try {
        const blob = await toBanner(file);
        setPreview(URL.createObjectURL(blob));
        const fd = new FormData();
        fd.append("banner", new File([blob], blob.type === "image/webp" ? "banner.webp" : "banner.jpg", { type: blob.type }));
        const r = await uploadBanner(fd);
        if (r.error) { setError(r.error); setPreview(null); } else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
        setPreview(null);
      }
    });
  };
  const b = bannerStyle(shown);

  return (
    <div className="mb-6">
      <div className={`glass relative min-h-[11rem] sm:min-h-[13rem] p-5 sm:p-6 flex items-end ${b?.className ?? "bg-gradient-to-r from-sky-200/80 via-brand-100/50 to-emerald-200/70 dark:from-sky-500/20 dark:to-emerald-500/15"}`} style={b?.style}>
        <div className="flex-1 min-w-0">{children}</div>
        <div className="absolute top-4 right-4 flex gap-2">
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => input.current?.click()}><ImagePlus className="w-3.5 h-3.5" />{pending ? "Uploading…" : shown ? "Change banner" : "Add banner"}</button>
          {shown && !pending && (
            <button type="button" className="btn btn-danger btn-sm" onClick={() => {
              if (!confirm("Remove your banner?")) return;
              start(async () => { const r = await removeBanner(); if (r.error) setError(r.error); else { setPreview(null); router.refresh(); } });
            }}><Trash2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Remove</span></button>
          )}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <p className="text-xs muted mt-2">Your banner shows on your profile and across the top of your dashboard. Wide pictures work best (JPG, PNG or WebP).</p>
      {error && <p role="alert" className="text-sm text-rose-600 mt-1">{error}</p>}
    </div>
  );
}
