import { EVERYONE, requireCtx } from "@/lib/auth";
import AdminDashboard from "./AdminDashboard";
import TeacherDashboard from "./TeacherDashboard";
import LearnerDashboard from "./LearnerDashboard";
import ParentDashboard from "./ParentDashboard";
import PlatformDashboard from "./PlatformDashboard";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const ctx = await requireCtx(EVERYONE);
  switch (ctx.user.role) {
    case "super_admin": return <PlatformDashboard ctx={ctx} sp={await searchParams} />;
    case "teacher": return <TeacherDashboard ctx={ctx} />;
    case "learner": return <LearnerDashboard ctx={ctx} />;
    case "parent": return <ParentDashboard ctx={ctx} />;
    default: return <AdminDashboard ctx={ctx} />;
  }
}
