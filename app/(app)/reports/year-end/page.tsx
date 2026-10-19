import { requireCtx } from "@/lib/auth";
import { yearEndPlan } from "@/lib/yearend";
import { PageHeader, Card, Empty } from "@/components/ui/kit";
import YearEndForm from "./YearEndForm";

export const metadata = { title: "Year-end promotion" };

export default async function YearEndPage() {
  const ctx = await requireCtx(["school_admin"]);
  const year = ctx.school.current_year;
  const plan = yearEndPlan(ctx);
  return (
    <>
      <PageHeader title="Year-end promotion" subtitle={`Close ${year} and move learners into ${year + 1}, based on their CAPS year results. You can change any learner's action before confirming.`} />
      {plan.length === 0 ? <Card><Empty title={`No classes for ${year}`} /></Card> : <YearEndForm plan={plan} year={year} />}
    </>
  );
}
