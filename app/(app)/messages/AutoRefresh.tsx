"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-reads the page every few seconds while it is open, so new chats and changed profile photos show without a reload. */
export default function AutoRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => { const t = setInterval(() => router.refresh(), seconds * 1000); return () => clearInterval(t); }, [router, seconds]);
  return null;
}
