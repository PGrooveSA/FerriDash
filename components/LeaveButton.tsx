import { FormDialog } from "@/components/ui/forms";
import { markLeft } from "@/app/actions/leavers";
import { LEFT_STATUSES } from "@/lib/leavers";
import { today } from "@/lib/today";

/** "Leaves": the learner or child moves to Past learners / Past children; their record is kept and their login switched off. */
export default function LeaveButton({ id, name, childcare, fees }: { id: number; name: string; childcare: boolean; fees: boolean }) {
  return (
    <FormDialog trigger="button" triggerLabel="Leaves" title={`${name} leaves the ${childcare ? "centre" : "school"}`} hidden={{ learner_id: id }} action={markLeft} submitLabel="Confirm"
      fields={[
        { name: "status", label: "Why", type: "select", required: true, options: LEFT_STATUSES[childcare ? "childcare" : "school"], half: true },
        { name: "left_on", label: "Last day", type: "date", required: true, defaultValue: today(), half: true },
        { name: "left_reason", label: childcare ? "Where to, or why (optional)" : "New school, or why (optional)", placeholder: childcare ? "e.g. Starting Grade R at Sunnyside Primary" : "e.g. Moved to Pretoria High School" },
        ...(fees ? [{ name: "cancel_fees", label: "Unpaid fees due after the last day", type: "select" as const, defaultValue: "1",
          options: [{ value: "1", label: "Cancel them" }, { value: "0", label: "Keep them" }] }] : []),
      ]}
    />
  );
}
