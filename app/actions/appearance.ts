"use server";
import { revalidatePath } from "next/cache";
import { audit, run } from "@/lib/db";
import { fail, guarded, str, type ActionResult } from "@/lib/action-utils";
import { isTheme } from "@/lib/themes";

/** School admin: the theme everyone at the school sees. Platform admin: their own theme. */
export async function saveTheme(_: ActionResult, f: FormData) {
  return guarded(["school_admin", "super_admin"], async (ctx) => {
    const theme = str(f, "theme");
    if (!isTheme(theme)) fail("Choose one of the themes.");
    if (ctx.user.role === "super_admin") await run("UPDATE users SET theme = ? WHERE id = ?", theme, ctx.user.id);
    else {
      await run("UPDATE schools SET theme = ? WHERE id = ?", theme, ctx.schoolId);
      await audit(ctx.schoolId, ctx.user.id, "update", "school_theme", ctx.schoolId);
    }
    revalidatePath("/", "layout");
    return { ok: true, message: "Theme saved." };
  });
}
