import { requireCtx } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";
import TeacherDashboard from "./TeacherDashboard";
import LearnerDashboard from "./LearnerDashboard";
import ParentDashboard from "./ParentDashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireCtx();
  switch (ctx.user.role) {
    case "teacher": return <TeacherDashboard ctx={ctx} />;
    case "learner": return <LearnerDashboard ctx={ctx} />;
    case "parent": return <ParentDashboard ctx={ctx} />;
    default: return <AdminDashboard ctx={ctx} />;
  }
}
