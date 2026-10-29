"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { personProfile, type PersonProfile } from "@/app/actions/profile";
import Avatar from "@/components/ui/Avatar";
import ViewImage from "@/components/ui/ViewImage";
import SchoolCrest from "@/components/SchoolCrest";

/** Wraps a person's photo or name: tapping it shows their profile (photo, role, classes or subjects, school). */
export default function PersonLink({ userId, children, className = "" }: { userId: number | null | undefined; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<PersonProfile | null | undefined>(undefined);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open) { ref.current?.close(); return; }
    ref.current?.showModal();
    personProfile(userId!).then(setP).catch(() => setP(null));
  }, [open, userId]);
  if (!userId) return <>{children}</>;

  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setP(undefined); setOpen(true); }} className={`text-left rounded-full focus-visible:outline-2 focus-visible:outline-brand-500 ${className}`}>{children}</button>
      <dialog ref={ref} onClose={() => setOpen(false)} className="m-auto w-[calc(100%-2rem)] max-w-sm bg-transparent backdrop:bg-slate-900/30 backdrop:backdrop-blur-sm">
        {open && (
          <div className="glass-solid p-6 text-[var(--ink)] relative">
            <button type="button" className="icon-btn !w-8 !h-8 absolute top-4 right-4" onClick={() => setOpen(false)} aria-label="Close"><X className="w-4 h-4" /></button>
            {p === undefined ? <p className="text-sm muted text-center py-10">Loading…</p> : p === null ? <p className="text-sm text-center py-10">This profile isn&apos;t available.</p> : (
              <div className="text-center">
                <ViewImage src={p.photo} alt={p.name}><Avatar first={p.first_name} last={p.last_name} size={112} photo={p.photo} /></ViewImage>
                <p className="text-lg font-semibold mt-3">{p.name}</p>
                <p className="text-sm muted">{p.role}</p>
                {p.details.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-sm text-left rounded-2xl bg-black/5 dark:bg-white/5 px-4 py-3">
                    {p.details.map((d) => <li key={d.label}><span className="muted">{d.label}: </span>{d.value}</li>)}
                  </ul>
                )}
                {p.school && (
                  <div className="mt-5 flex items-center gap-3 justify-center">
                    <SchoolCrest school={p.school} size={44} zoom />
                    <p className="text-sm font-semibold text-left leading-snug">{p.school.name}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
