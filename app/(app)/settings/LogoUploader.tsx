"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2, School } from "lucide-react";
import { uploadLogo, removeLogo } from "@/app/actions/academics";

const MAX_SIDE = 512; // logos keep their shape; the longest side is scaled to at most 512px

/** Scales the logo down, keeps transparency, and re-encodes as WebP (PNG fallback). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That file isn't an image this browser can read."); });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.92));
  const webp = await encode("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await encode("image/png");
  if (!blob) throw new Error("Could not process that logo.");
  return blob;
}

export default function LogoUploader({ logo, schoolName }: { logo: string | null; schoolName: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const shown = preview ?? logo;

  const handle = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setError("Please choose a PNG, JPG or WebP image. A PNG with a transparent background looks best.");
    if (file.size > 15 * 1024 * 1024) return setError("That file is very large. Please choose an image under 15 MB.");
    start(async () => {
      try {
        const blob = await shrink(file);
        setPreview(URL.createObjectURL(blob));
        const fd = new FormData();
        fd.append("logo", new File([blob], blob.type === "image/webp" ? "logo.webp" : "logo.png", { type: blob.type }));
        const r = await uploadLogo(fd);
        if (r.error) { setError(r.error); setPreview(null); } else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
        setPreview(null);
      }
    });
  };

  return (
    <div className="glass p-6">
      <h2 className="font-semibold text-lg">School logo</h2>
      <p className="text-sm muted mt-1">Shown on everyone's dashboard, in the sidebar, and on report cards and fee statements. Only school administrators can change it.</p>
      <div className="flex flex-wrap items-center gap-6 mt-4">
        <button type="button" disabled={pending} onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
          className={`relative w-40 h-40 rounded-3xl grid place-items-center overflow-hidden border-2 border-dashed transition ${dragging ? "border-brand-500 bg-brand-100/60 scale-105" : "border-line bg-white/60 dark:bg-white/5 hover:border-brand-400"}`}
          aria-label="Upload school logo">
          {shown ? <img src={shown} alt={`${schoolName} logo`} className="max-w-[85%] max-h-[85%] object-contain" /> : (
            <span className="text-center muted text-xs px-3"><School className="w-9 h-9 mx-auto mb-2" />Drop logo here<br />or click to choose</span>
          )}
          {pending && <span className="absolute inset-0 grid place-items-center bg-white/70 dark:bg-slate-900/70 text-xs font-semibold">Uploading…</span>}
        </button>
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => input.current?.click()}><ImagePlus className="w-3.5 h-3.5" />{shown ? "Replace logo" : "Upload logo"}</button>
            {shown && (
              <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => {
                if (!confirm("Remove the school logo? Dashboards and reports will show the school initials instead.")) return;
                start(async () => { const r = await removeLogo(); if (r.error) setError(r.error); else { setPreview(null); router.refresh(); } });
              }}><Trash2 className="w-3.5 h-3.5" />Remove</button>
            )}
          </div>
          <p className="text-xs muted max-w-xs">PNG, JPG or WebP. Use a transparent PNG for the best result on light and dark backgrounds.</p>
          {error && <p role="alert" className="text-sm text-rose-600 max-w-xs">{error}</p>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}
