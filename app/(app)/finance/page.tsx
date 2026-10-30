import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";

export default async function FinanceIndex() {
  await requireCtx(["school_admin"]);
  redirect("/finance/expenses");
}
