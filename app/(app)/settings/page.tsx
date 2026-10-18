import { requireCtx } from "@/lib/auth";
import { all } from "@/lib/db";
import { PROVINCES } from "@/lib/format";
import { CAPS_LEVELS, SBA_WEIGHT } from "@/lib/caps";
import { Card, PageHeader } from "@/components/ui/kit";
import SettingsForm from "./SettingsForm";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireCtx(["school_admin"]);
  const terms = all<{ number: number; start_date: string; end_date: string }>("SELECT number, start_date, end_date FROM terms WHERE school_id = ? AND year = ? ORDER BY number", ctx.schoolId, ctx.school.current_year);
  const logs = all<{ action: string; entity: string; created_at: string; name: string | null; detail: string | null }>(`SELECT a.action, a.entity, a.created_at, a.detail, u.first_name || ' ' || u.last_name name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.school_id = ? ORDER BY a.id DESC LIMIT 15`, ctx.schoolId);
  return (
    <>
      <PageHeader title="School settings" subtitle="Profile, academic calendar and CAPS assessment configuration." />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_24rem] gap-6">
        <SettingsForm school={ctx.school} terms={terms} provinces={PROVINCES} />
        <div className="space-y-6">
          <Card title="CAPS achievement levels">
            <table className="table text-sm"><thead><tr><th>Level</th><th>Mark</th><th>Descriptor</th></tr></thead>
              <tbody>{CAPS_LEVELS.map((l) => <tr key={l.level}><td className="font-bold">{l.level}</td><td>{l.min}–{l.max}%</td><td>{l.descriptor}</td></tr>)}</tbody></table>
          </Card>
          <Card title="Assessment weighting by phase">
            <ul className="text-sm space-y-2">{Object.entries(SBA_WEIGHT).map(([p, w]) => <li key={p} className="flex justify-between"><span>{p} Phase</span><span className="muted">SBA {w * 100}% · Exams {Math.round((1 - w) * 100)}%</span></li>)}</ul>
            <p className="text-xs muted mt-3">Promotion rules follow the National Policy on Programme and Promotion Requirements. Verify against the latest DBE circulars.</p>
          </Card>
          <Card title="Audit trail">
            <ul className="text-xs space-y-2">{logs.map((l, i) => <li key={i}><b>{l.name ?? "System"}</b> {l.action.replace("_", " ")} {l.entity} <span className="muted">· {l.created_at}</span></li>)}</ul>
          </Card>
        </div>
      </div>
    </>
  );
}
