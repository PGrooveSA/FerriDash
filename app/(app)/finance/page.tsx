import { redirect } from "next/navigation";
import { requireCtx } from "@/lib/auth";

export default async function FinanceIndex() {
  const ctx = await requireCtx(["school_admin", "parent"]);
  redirect(ctx.user.role === "parent" ? "/finance/statement" : "/finance/fees");
}
