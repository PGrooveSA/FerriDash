import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Table2, ArrowUpCircle, CalendarCheck, Wallet, BarChart3 } from "lucide-react";
import { requireCtx } from "@/lib/auth";
import { PageHeader } from "@/components/ui/kit";

export const metadata = { title: "Reports" };

const REPORTS = [
  { href: "/reports/report-cards", icon: FileText, title: "Report cards", text: "CAPS learner progress reports per term or year. Print one learner or the whole class to PDF.", tone: "from-brand-200/80", admin: false },
  { href: "/reports/broadsheet", icon: Table2, title: "Class broadsheet", text: "Every learner's mark in every subject with averages and positions. Export to Excel (CSV).", tone: "from-gold-200/80", admin: false },
  { href: "/reports/promotion", icon: ArrowUpCircle, title: "Promotion schedule", text: "End-of-year outcomes against the CAPS promotion requirements, including NSC pass types for Grade 12.", tone: "from-butter-300/80", admin: false },
  { href: "/results/analysis", icon: BarChart3, title: "Results analysis", text: "Subject averages, pass rates, CAPS level distribution and learners needing support.", tone: "from-emerald-200/70", admin: false },
  { href: "/reports/attendance", icon: CalendarCheck, title: "Attendance report", text: "Attendance rates per learner and per class for any date range, with chronic absentees flagged.", tone: "from-brand-200/80", admin: false },
  { href: "/reports/finance", icon: Wallet, title: "Finance report", text: "Fees billed, collected and outstanding in Rand, debtors list and expenses by category.", tone: "from-gold-200/80", admin: true },
];

export default async function ReportsPage() {
  const ctx = await requireCtx();
  if (ctx.user.role === "learner" || ctx.user.role === "parent") redirect("/reports/report-cards");
  return (
    <>
      <PageHeader title="Reports" subtitle="Generate, print and export school reports." />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {REPORTS.filter((r) => !r.admin || ctx.isAdmin).map((r) => (
          <Link key={r.href} href={r.href} className={`glass p-6 bg-gradient-to-br ${r.tone} to-transparent dark:from-white/5 hover:-translate-y-0.5 transition-transform`}>
            <span className="icon-btn !w-12 !h-12"><r.icon className="w-6 h-6" /></span>
            <h2 className="text-lg font-semibold mt-4">{r.title}</h2>
            <p className="text-sm muted mt-1">{r.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
