import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { zar } from "@/lib/format";
import { MONTHS } from "@/lib/today";
import { Card, PageHeader, StatCard, Empty } from "@/components/ui/kit";
import { PrintButton, CsvButton } from "@/components/ui/forms";
import { Bars, Donut } from "@/components/charts";
import { CalendarRange, Receipt, Tag, TrendingUp } from "lucide-react";

export const metadata = { title: "Finance report" };
const COLORS = ["#ffa86d", "#ffdf55", "#fde68a", "#86efac", "#fda4af", "#e8906c", "#fdba74", "#7a716a", "#f4b6a0", "#bef264", "#fcd34d", "#94a3b8"];

/** The school's spending for the year: by category, by month and the largest expenses. */
export default async function FinanceReport() {
  const ctx = await requireCtx(["school_admin"]);
  const year = ctx.school.current_year;
  const rows = await all<{ id: number; category: string; description: string; supplier: string | null; amount: number; paid_on: string }>(
    "SELECT id, category, description, supplier, amount, paid_on FROM expenses WHERE school_id = ? AND paid_on LIKE ? ORDER BY paid_on", ctx.schoolId, `${year}-%`);
  const byCategory = [...rows.reduce((m, r) => m.set(r.category, (m.get(r.category) ?? 0) + r.amount), new Map<string, number>())]
    .map(([category, total]) => ({ category, total })).sort((a, b) => b.total - a.total);
  const byMonth = MONTHS.map((name, i) => ({ name, spent: Math.round(rows.filter((r) => Number(r.paid_on.slice(5, 7)) === i + 1).reduce((a, r) => a + r.amount, 0)) }));
  const spent = rows.reduce((a, r) => a + r.amount, 0);
  const month = new Date().getMonth();
  const largest = [...rows].sort((a, b) => b.amount - a.amount).slice(0, 10);

  const csv = [
    [`${ctx.school.name} - Expenses ${year}`], ["Date", "Category", "Description", "Supplier", "Amount (ZAR)"],
    ...rows.map((r) => [r.paid_on, r.category, r.description, r.supplier, r.amount.toFixed(2)]),
    [], ["Expenses by category"], ...byCategory.map((e) => [e.category, e.total.toFixed(2)]),
  ];

  return (
    <>
      <PageHeader title="Finance report" subtitle={`${year} school expenses · all amounts in South African Rand (ZAR)`}>
        <CsvButton filename={`expenses-${year}.csv`} rows={csv} />
        <PrintButton label="Print" />
      </PageHeader>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Spent this year" value={zar(spent, true)} icon={TrendingUp} tone="gold" />
        <StatCard label="This month" value={zar(byMonth[month]?.spent ?? 0, true)} icon={CalendarRange} tone="sky" />
        <StatCard label="Expenses recorded" value={rows.length} icon={Receipt} tone="green" />
        <StatCard label="Largest category" value={byCategory[0]?.category ?? "-"} icon={Tag} tone="orange" hint={byCategory[0] ? zar(byCategory[0].total, true) : undefined} />
      </div>
      {rows.length === 0 ? <Card><Empty title="No expenses this year" hint="Record expenses under Finance → School Expenses." /></Card> : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_22rem] gap-6 mb-6">
            <Card title="Spending by month" className="print-area">
              <Bars data={byMonth} xKey="name" series={[{ key: "spent", name: "Spent (R)", color: "#ffa86d" }]} />
            </Card>
            <Card title="Expenses by category">
              <Donut data={byCategory.map((e, i) => ({ name: e.category, value: Math.round(e.total), color: COLORS[i % COLORS.length] }))} center={zar(spent, true)} sub="spent" />
              <ul className="text-xs mt-4 space-y-1">{byCategory.map((e, i) => <li key={e.category} className="flex justify-between"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{e.category}</span><span>{zar(e.total, true)}</span></li>)}</ul>
            </Card>
          </div>
          <Card title="Largest expenses" className="print-area">
            <div className="overflow-x-auto"><table className="table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Supplier</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{largest.map((r) => <tr key={r.id}><td>{r.paid_on}</td><td>{r.category}</td><td className="font-medium">{r.description}</td><td>{r.supplier ?? "-"}</td><td className="text-right font-semibold">{zar(r.amount)}</td></tr>)}</tbody>
            </table></div>
          </Card>
        </>
      )}
    </>
  );
}
