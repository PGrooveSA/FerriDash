import { requireCtx } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { zar, fmtDate } from "@/lib/format";
import { today } from "@/lib/today";
import { Card, PageHeader, Pager, Empty, hrefWith } from "@/components/ui/kit";
import { FormDialog, DeleteButton, Filters, CsvButton, type Field } from "@/components/ui/forms";
import { saveExpense, deleteExpense } from "@/app/actions/finance";
import { FileText } from "lucide-react";

export const metadata = { title: "School expenses" };
const PER_PAGE = 12;
const CATEGORIES = ["Laboratory", "Maintenance", "Nutrition (NSNP)", "Library", "Sport", "ICT", "Transport", "Utilities", "Stationery", "Security", "Cleaning", "LTSM (textbooks)", "Salaries (SGB posts)", "Other"];
type E = { id: number; reference: string | null; category: string; description: string; quantity: string | null; amount: number; paid_on: string; supplier: string | null; document_name: string | null };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(["school_admin"]);
  const sp = await searchParams;
  const q = sp.q?.trim() ?? "", cat = sp.category ?? "", month = sp.month ?? "", page = Math.max(1, Number(sp.page) || 1);
  const where = "school_id = ?1 AND (?2 = '' OR category = ?2) AND (?3 = '' OR paid_on LIKE ?3 || '%') AND (?4 = '' OR description LIKE '%' || ?4 || '%' OR reference LIKE '%' || ?4 || '%' OR supplier LIKE '%' || ?4 || '%')";
  const args = [ctx.schoolId, cat, month, q] as const;
  const agg = get<{ n: number; total: number }>(`SELECT COUNT(*) n, COALESCE(SUM(amount), 0) total FROM expenses WHERE ${where}`, ...args)!;
  const rows = all<E>(`SELECT * FROM expenses WHERE ${where} ORDER BY paid_on DESC LIMIT ?5 OFFSET ?6`, ...args, PER_PAGE, (page - 1) * PER_PAGE);
  const months = all<{ m: string }>("SELECT DISTINCT substr(paid_on, 1, 7) m FROM expenses WHERE school_id = ? ORDER BY m DESC", ctx.schoolId);
  const fields = (e?: E): Field[] => [
    { name: "category", label: "Category", type: "select", required: true, options: CATEGORIES.map((c) => ({ value: c, label: c })), defaultValue: e?.category, half: true },
    { name: "reference", label: "Reference / voucher no.", defaultValue: e?.reference, half: true },
    { name: "description", label: "Expense", required: true, defaultValue: e?.description },
    { name: "quantity", label: "Quantity", defaultValue: e?.quantity, placeholder: "e.g. 30 items", half: true },
    { name: "amount", label: "Amount (R)", type: "number", step: "0.01", required: true, defaultValue: e?.amount, half: true },
    { name: "paid_on", label: "Payment date", type: "date", required: true, defaultValue: e?.paid_on ?? today(), half: true },
    { name: "supplier", label: "Supplier", defaultValue: e?.supplier, half: true },
    { name: "document", label: e?.document_name ? "Replace document (PDF)" : "Supporting document (PDF)", type: "file", accept: ".pdf,application/pdf", maxMb: 10,
      placeholder: "Invoice, quote or receipt as a PDF", help: e?.document_name ? `Current: ${e.document_name}. Choose a new PDF to replace it.` : "Optional. PDF only, up to 10 MB." },
    ...(e?.document_name ? [{ name: "remove_document", label: "Current document", type: "select", options: [{ value: "0", label: "Keep it" }, { value: "1", label: "Remove it" }], defaultValue: "0", half: true } as Field] : []),
  ];
  const csv = [["Reference", "Category", "Expense", "Quantity", "Amount (ZAR)", "Payment date", "Supplier", "Document"], ...rows.map((e) => [e.reference, e.category, e.description, e.quantity, e.amount.toFixed(2), e.paid_on, e.supplier, e.document_name])];

  return (
    <>
      <PageHeader title="School expenses" subtitle={`${agg.n} expense${agg.n === 1 ? "" : "s"} · ${zar(agg.total)}`}>
        <Filters search={{ name: "q", placeholder: "Search expense, ref or supplier", value: q }} filters={[
          { name: "month", label: "Month", value: month, allLabel: "All months", options: months.map((m) => ({ value: m.m, label: fmtDate(m.m + "-01", { month: "long", year: "numeric" }) })) },
          { name: "category", label: "Category", value: cat, allLabel: "All categories", options: CATEGORIES.map((c) => ({ value: c, label: c })) },
        ]} />
        <CsvButton filename="expenses.csv" rows={csv} />
        <FormDialog title="Record expense" triggerLabel="Add expense" fields={fields()} action={saveExpense} />
      </PageHeader>
      <Card>
        {rows.length === 0 ? <Empty title="No expenses found" /> : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Ref</th><th>Category</th><th>Expense</th><th>Quantity</th><th>Amount</th><th>Payment date</th><th>Supplier</th><th>Document</th><th className="text-right">Action</th></tr></thead>
              <tbody>{rows.map((e) => (
                <tr key={e.id}>
                  <td className="font-mono text-xs">{e.reference}</td><td>{e.category}</td><td className="font-medium">{e.description}</td><td>{e.quantity}</td>
                  <td className="font-semibold">{zar(e.amount)}</td><td><span className="chip chip-slate">{fmtDate(e.paid_on)}</span></td><td className="text-sm">{e.supplier}</td>
                  <td>{e.document_name ? (
                    <a href={`/api/expense-doc/${e.id}`} target="_blank" rel="noopener" title={`Open ${e.document_name}`} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 max-w-[12rem]">
                      <FileText className="w-3.5 h-3.5 shrink-0" /><span className="truncate">{e.document_name}</span>
                    </a>) : <span className="muted text-xs">None</span>}</td>
                  <td><div className="flex justify-end gap-1.5"><FormDialog trigger="edit" title="Edit expense" fields={fields(e)} hidden={{ id: e.id }} action={saveExpense} /><DeleteButton action={deleteExpense.bind(null, e.id)} label={e.description} /></div></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pages={Math.ceil(agg.n / PER_PAGE)} makeHref={(p) => hrefWith("/finance/expenses", sp, { page: p })} />
      </Card>
    </>
  );
}
