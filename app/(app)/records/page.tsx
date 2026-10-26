import { redirect } from "next/navigation";
import { requireCtx, ownLearnerIds } from "@/lib/auth";
import { Card, Empty } from "@/components/ui/kit";

// Learners and parents: open the learner's own record (parents can switch between children there).
export default async function MyRecordPage() {
  const ctx = await requireCtx(["learner", "parent"]);
  const first = ((await ownLearnerIds(ctx)) ?? [])[0];
  if (first) redirect(`/learners/${first}`);
  return <Card><Empty title="No learner linked to this account" /></Card>;
}
