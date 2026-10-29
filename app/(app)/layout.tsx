import { Mail, Phone } from "lucide-react";
import { EVERYONE, requireCtx } from "@/lib/auth";
import Sidebar from "@/components/shell/Sidebar";
import Topbar from "@/components/shell/Topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx(EVERYONE);
  const platform = ctx.user.role === "super_admin";
  return (
    <div className="min-h-screen">
      <div className="no-print"><Sidebar role={ctx.user.role} school={platform ? null : { id: ctx.school.id, name: ctx.school.name, logo_updated_at: ctx.school.logo_updated_at }} /></div>
      <div className="app-content lg:pl-[17rem]">
        <div className="app-content-inner max-w-[1600px] mx-auto px-4 sm:px-6 py-4 flex flex-col min-h-screen">
          <div className="no-print"><Topbar ctx={ctx} /></div>
          <main className="flex-1 py-6">{children}</main>
          {/* The user's own school's contact details, pinned to the bottom of the screen (phones and the apps too). */}
          {!platform && (ctx.school.email || ctx.school.phone) && (
            <footer className="no-print sticky bottom-3 z-20 glass-solid !rounded-2xl flex flex-wrap items-center gap-x-6 gap-y-1 text-xs sm:text-sm muted px-5 py-3">
              {ctx.school.email && <a href={`mailto:${ctx.school.email}`} className="flex items-center gap-2 min-w-0 hover:text-[var(--ink)]"><Mail className="w-4 h-4 shrink-0 text-sky-500" /><span className="truncate">{ctx.school.email}</span></a>}
              {ctx.school.phone && <a href={`tel:${ctx.school.phone.replace(/[^\d+]/g, "")}`} className="flex items-center gap-2 hover:text-[var(--ink)]"><Phone className="w-4 h-4 shrink-0 text-emerald-500" />{ctx.school.phone}</a>}
            </footer>
          )}
        </div>
      </div>
    </div>
  );
}
