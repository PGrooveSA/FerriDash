import { Card, PageHeader, Empty } from "@/components/ui/kit";

/** Fee pages for a school without fee billing: no-fee schools, and fee-paying schools the platform admin hasn't switched it on for. */
export default function FeesOff({ title }: { title: string }) {
  return <><PageHeader title={title} /><Card><Empty title="Fee billing is not switched on" hint="Fee billing is only for fee-paying schools, and FerriDash switches it on per school. School Expenses are always available under Finance." /></Card></>;
}
