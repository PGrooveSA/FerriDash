import { requireCtx } from "@/lib/auth";
import { THEMES, themeOr } from "@/lib/themes";
import { PageHeader } from "@/components/ui/kit";
import ThemePicker from "./ThemePicker";

export const metadata = { title: "Appearance" };

export default async function AppearancePage() {
  const ctx = await requireCtx(["school_admin", "super_admin"]);
  const platform = ctx.user.role === "super_admin";
  return (
    <>
      <PageHeader title="Appearance" subtitle={platform
        ? "Choose the colours, font and style of your platform admin screens. Each school chooses its own."
        : `Choose the colours, font and style everyone at ${ctx.school.name} sees: staff, learners and parents.`} />
      <ThemePicker themes={THEMES} current={themeOr(platform ? ctx.user.theme : ctx.school.theme)} />
    </>
  );
}
