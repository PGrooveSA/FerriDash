import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { zar, gradeLabel } from "@/lib/format";
import { Card, PageHeader, StatCard } from "@/components/ui/kit";
import { PrintButton, CsvButton } from "@/components/ui/forms";
import { Donut } from "@/components/charts";
import { Wallet, TrendingUp, AlertTriangle, Receipt } from "lucide-react";

export const metadata = { title: "Finance report" };
const COLORS = ["#ffa86d", "#ffdf55", "#fde68a", "#86efac", "#fda4af", "#e8906c", "#fdba74", "#7a716a", "#f4b6a0", "#bef264", "#fcd34d", "#94a3b8"];

export default async function FinanceReport() {
  const ctx = await requireCtx(["school_admin"]);
  const year = ctx.school.current_year;
  const byGrade = all<{ grade: number; learners: number; billed: number; paid: number }>(`
    SELECT c.grade, COUNT(DISTINCT i.learner_id) learners, SUM(i.tuition + i.activities + i.other) billed,
      SUM((SELECT COALESCE(SUM(p.amount), 0) FROM payments p WHERE p.invoice_id = i.id)) paid
    FROM invoices i JOIN learners l ON l.id = i.learner_id JOIN classes c ON c.id = l.class_id
    WHERE i.school_id = ? AND i.year = ? GROUP BY c.grade ORDER BY c.grade`, ctx.schoolId, year);
  const debtors = all<{ id: number; name: string; className: string; billed: number; paid: number; parent: string | null }>(`
    SELECT l.id, l.first_name || ' ' || l.last_name name, c.name className, SUM(i.tuition + i.activities + i.other) billed,
      (SELECT COALESCE(SUM(p.amount), 0) FROM payments p JOIN invoices i2 ON i2.id = p.invoice_id WHERE i2.learner_id = l.id AND i2.year = ?2) paid,
      (SELECT u.first_name || ' ' || u.last_name || ' · ' || COALESCE(u.phone, u.email) FROM guardian_links g JOIN users u ON u.id = g.parent_user_id WHERE g.learner_id = l.id LIMIT 1) parent
    FROM invoices i JOIN learners l ON l.id = i.learner_id JOIN classes c ON c.id = l.class_id
    WHERE i.school_id = ?1 AND i.year = ?2 GROUP BY l.id HAVING billed - paid > 0.5 ORDER BY billed - paid DESC`, ctx.schoolId, year);
  const expenses = all<{ category: string; total: number }>("SELECT category, SUM(amount) total FROM expenses WHERE school_id = ? AND paid_on LIKE ? GROUP BY category ORDER BY total DESC", ctx.schoolId, `${year}-%`);
  const billed = byGrade.reduce((a, r) => a + r.billed, 0), paid = byGrade.reduce((a, r) => a + r.paid, 0), spent = expenses.reduce((a, r) => a + r.total, 0);

  const csv = [
    [`${ctx.school.name} - Finance report ${year}`], ["Grade", "Learners", "Billed (ZAR)", "Collected (ZAR)", "Outstanding (ZAR)", "Collection %"],
    ...byGrade.map((r) => [gradeLabel(r.grade), r.learners, r.billed.toFixed(2), r.paid.toFixed(2), (r.billed - r.paid).toFixed(2), r.billed ? Math.round((r.paid / r.billed) * 100) : 0]),
    [], ["Debtors"], ["Learner", "Class", "Outstanding (ZAR)", "Parent"], ...debtors.map((d) => [d.name, d.className, (d.billed - d.paid).toFixed(2), d.parent]),
    [], ["Expenses by category"], ...expenses.map((e) => [e.category, e.total.toFixed(2)]),
  ];

  return (
    <>
      <PageHeader title="Finance report" subtitle={`${year} financial year · all amounts in South African Rand (ZAR)`}>
        <CsvButton filename={`finance-${year}.csv`} rows={csv} />
        <PrintButton label="Print" />
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Fees billed" value={zar(billed, true)} icon={Receipt} tone="sky" />
        <StatCard label="Fees collected" value={zar(paid, true)} icon={Wallet} tone="green" hint={billed ? `${Math.round((paid / billed) * 100)}% collection rate` : undefined} />
        <StatCard label="Outstanding" value={zar(billed - paid, true)} icon={AlertTriangle} tone="butter" hint={`${debtors.length} accounts in arrears`} />
        <StatCard label="Expenses" value={zar(spent, true)} icon={TrendingUp} tone="gold" hint={`Net ${zar(paid - spent, true)}`} />
      </div>
      {!ctx.school.fee_paying && <div className="glass p-4 mb-6 text-sm">This is a no-fee school. Only expenses are tracked.</div>}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6 mb-6">
        <Card title="Collection by grade" className="print-area">
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Grade</th><th>Learners</th><th>Billed</th><th>Collected</th><th>Outstanding</th><th>Collection</th></tr></thead>
            <tbody>{byGrade.map((r) => {
              const pct = r.billed ? Math.round((r.paid / r.billed) * 100) : 0;
              return <tr key={r.grade}><td className="font-medium">{gradeLabel(r.grade)}</td><td>{r.learners}</td><td>{zar(r.billed)}</td><td>{zar(r.paid)}</td><td className="text-rose-600">{zar(r.billed - r.paid)}</td>
                <td className="min-w-[8rem]"><div className="h-2 rounded-full bg-slate-500/15"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} /></div><span className="text-xs muted">{pct}%</span></td></tr>;
            })}</tbody>
          </table></div>
        </Card>
        <Card title="Expenses by category">
          <Donut data={expenses.map((e, i) => ({ name: e.category, value: Math.round(e.total), color: COLORS[i % COLORS.length] }))} center={zar(spent, true)} sub="spent" />
          <ul className="text-xs mt-4 space-y-1">{expenses.map((e, i) => <li key={e.category} className="flex justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{e.category}</span><span>{zar(e.total, true)}</span></li>)}</ul>
        </Card>
      </div>
      <Card title={`Debtors list (${debtors.length})`} className="print-area">
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Learner</th><th>Class</th><th>Billed</th><th>Paid</th><th>Outstanding</th><th>Parent / guardian</th></tr></thead>
          <tbody>{debtors.map((d) => <tr key={d.id}><td className="font-medium"><Link className="hover:underline" href={`/finance/fees?q=${encodeURIComponent(d.name)}`}>{d.name}</Link></td><td>{d.className}</td><td>{zar(d.billed)}</td><td>{zar(d.paid)}</td><td className="font-semibold text-rose-600">{zar(d.billed - d.paid)}</td><td className="text-xs">{d.parent ?? "-"}</td></tr>)}</tbody>
        </table></div>
      </Card>
    </>
  );
}
