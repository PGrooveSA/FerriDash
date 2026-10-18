import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  return (
    <div className="min-h-screen">
      <div className="no-print"><Sidebar role={ctx.user.role} school={{ id: ctx.school.id, name: ctx.school.name, logo_updated_at: ctx.school.logo_updated_at }} /></div>
      <div className="lg:pl-[17rem]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-col min-h-screen">
          <div className="no-print"><Topbar ctx={ctx} /></div>
          <main className="flex-1 py-6">{children}</main>
          <footer className="no-print flex flex-wrap items-center gap-x-6 gap-y-2 text-sm muted py-4 border-t border-line">
            <span className="flex items-center gap-2"><Mail className="w-4 h-4" />{ctx.school.email}</span>
            <span className="flex items-center gap-2"><Phone className="w-4 h-4" />{ctx.school.phone}</span>
            <span className="ml-auto flex flex-wrap gap-x-6 gap-y-1">
              <Link href="/legal/terms" className="hover:text-[var(--ink)]">Terms of Use</Link>
              <Link href="/legal/privacy" className="hover:text-[var(--ink)]">Privacy Policy (POPIA)</Link>
              <span>Copyright © Infinite Q Graphics</span>
            </span>
          </footer>
        </div>
      </div>
    </div>
  );
}
