"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/** Makes a picture (profile photo, school logo) tappable: it opens full size over the page. Without a picture, just the children. */
export default function ViewImage({ src, alt, children, className = "" }: { src: string | null | undefined; alt: string; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) ref.current?.showModal(); else ref.current?.close(); }, [open]);
  if (!src) return <>{children}</>;
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} aria-label={`View ${alt}`} className={`rounded-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}>{children}</button>
      <dialog ref={ref} onClose={() => setOpen(false)} onClick={() => setOpen(false)} className="m-auto bg-transparent p-0 max-w-[min(92vw,40rem)] backdrop:bg-slate-900/70 backdrop:backdrop-blur-sm">
        {open && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="block max-w-full max-h-[85vh] rounded-3xl object-contain bg-white/90 dark:bg-slate-800 shadow-2xl" />
            <button type="button" className="icon-btn absolute top-3 right-3 !bg-white/90 dark:!bg-slate-900/90" aria-label="Close" onClick={() => setOpen(false)}><X className="w-4 h-4" /></button>
            <p className="text-center text-sm text-white mt-3 font-medium">{alt}</p>
          </div>
        )}
      </dialog>
    </>
  );
}
