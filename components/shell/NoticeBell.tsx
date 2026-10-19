"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";

/** Bell icon; the red dot shows only when there are unread notices (and not while reading them). */
export default function NoticeBell({ unread }: { unread: number }) {
  const onNotices = usePathname().startsWith("/notices");
  const show = unread > 0 && !onNotices;
  return (
    <Link href="/notices" className="icon-btn relative" aria-label={show ? `Notices, ${unread} unread` : "Notices"} title={show ? `${unread} unread notice${unread === 1 ? "" : "s"}` : "Notices"}>
      <Bell className="w-[1.1rem] h-[1.1rem]" />
      {show && <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white dark:ring-slate-900" />}
    </Link>
  );
}
