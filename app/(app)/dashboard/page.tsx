import { EVERYONE, requireCtx } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";
import TeacherDashboard from "./TeacherDashboard";
import LearnerDashboard from "./LearnerDashboard";
import ParentDashboard from "./ParentDashboard";
import PlatformDashboard from "./PlatformDashboard";
import ChildcareDashboard from "./ChildcareDashboard";
import ChildcareParentDashboard from "./ChildcareParentDashboard";
import { isChildcare } from "@/lib/org";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(EVERYONE);
  // Childcare centres: the owner and practitioners share one dashboard; parents follow their children's day.
  if (ctx.user.role !== "super_admin" && isChildcare(ctx.school)) return ctx.user.role === "parent" ? <ChildcareParentDashboard ctx={ctx} /> : <ChildcareDashboard ctx={ctx} />;
  switch (ctx.user.role) {
    case "super_admin": return <PlatformDashboard ctx={ctx} sp={await searchParams} />;
    case "teacher": return <TeacherDashboard ctx={ctx} />;
    case "learner": return <LearnerDashboard ctx={ctx} />;
    case "parent": return <ParentDashboard ctx={ctx} />;
    default: return <AdminDashboard ctx={ctx} />;
  }
}
