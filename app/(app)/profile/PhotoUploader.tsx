"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import { uploadAvatar, removeAvatar } from "@/app/actions/people";

const SIZE = 320; // stored photo is a 320×320 square

/** Crops the picked image to a centred square and re-encodes it small (WebP, JPEG fallback). */
async function toSquare(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error("That file isn't an image this browser can read."); });
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  g.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, 0.88));
  const webp = await encode("image/webp");
  const blob = webp?.type === "image/webp" ? webp : await encode("image/jpeg");
  if (!blob) throw new Error("Could not process that photo.");
  return blob;
}

export default function PhotoUploader({ first, last, photo }: { first: string; last: string; photo: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const handle = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) return setError("Please choose a JPG, PNG or WebP image.");
    if (file.size > 15 * 1024 * 1024) return setError("That file is very large. Please choose a photo under 15 MB.");
    start(async () => {
      try {
        const blob = await toSquare(file);
        setPreview(URL.createObjectURL(blob));
        const fd = new FormData();
        fd.append("photo", new File([blob], blob.type === "image/webp" ? "photo.webp" : "photo.jpg", { type: blob.type }));
        const r = await uploadAvatar(fd);
        if (r.error) { setError(r.error); setPreview(null); } else router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
        setPreview(null);
      }
    });
  };

  return (
    <div className="flex flex-col items-center">
      <button type="button" onClick={() => input.current?.click()} disabled={pending}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files[0]); }}
        className={`group relative rounded-full transition ${dragging ? "ring-4 ring-brand-400 scale-105" : ""}`} aria-label="Change profile photo">
        <Avatar first={first} last={last} size={112} online photo={preview ?? photo} />
        <span className="absolute inset-0 rounded-full grid place-items-center bg-slate-900/45 text-white opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition">
          <Camera className="w-7 h-7" />
        </span>
        {pending && <span className="absolute inset-0 rounded-full grid place-items-center bg-white/60 dark:bg-slate-900/60 text-xs font-semibold">Uploading…</span>}
      </button>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = ""; }} />
      <div className="flex gap-2 mt-4">
        <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => input.current?.click()}><Camera className="w-3.5 h-3.5" />{photo || preview ? "Change photo" : "Upload photo"}</button>
        {(photo || preview) && (
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => {
            if (!confirm("Remove your profile photo?")) return;
            start(async () => { const r = await removeAvatar(); if (r.error) setError(r.error); else { setPreview(null); router.refresh(); } });
          }}><Trash2 className="w-3.5 h-3.5" />Remove</button>
        )}
      </div>
      <p className="text-xs muted mt-2 text-center">JPG, PNG or WebP. Drag a photo onto the circle or tap to choose. On a phone you can take one with the camera.</p>
      {error && <p role="alert" className="text-sm text-rose-600 mt-2 text-center">{error}</p>}
    </div>
  );
}
