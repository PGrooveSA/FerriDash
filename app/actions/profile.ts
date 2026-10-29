"use server";
import { all, get } from "@/lib/db";
import { getCtx } from "@/lib/auth";
import { ROLE_LABEL, avatarUrl, bannerUrl, fullName, gradeLabel, logoUrl } from "@/lib/format";

export type PersonProfile = {
  first_name: string; last_name: string; name: string; role: string; photo: string | null; banner: string | null;
  details: { label: string; value: string }[];
  school: { id: number; name: string; logo_updated_at: string | null; logo: string | null } | null;
};

/**
 * What one person can see about another in the same school: photo, role, and their classes or subjects.
 * No contact details (POPIA). A parent's children are shown to school staff only.
 */
export async function personProfile(userId: number): Promise<PersonProfile | null> {
  const ctx = await getCtx();
  if (!ctx || !Number.isInteger(userId)) return null;
  const u = await get<{ id: number; school_id: number | null; role: string; title: string | null; first_name: string; last_name: string; avatar_updated_at: string | null; banner_updated_at: string | null }>(
    "SELECT id, school_id, role, title, first_name, last_name, avatar_updated_at, banner_updated_at FROM users WHERE id = ? AND active = 1", userId);
  if (!u || (u.school_id !== ctx.schoolId && ctx.user.role !== "super_admin")) return null;
  const year = ctx.school.current_year, staff = ctx.isAdmin || ctx.user.role === "teacher";
  const details: PersonProfile["details"] = [];

  if (u.role === "teacher") {
    const t = await get<{ id: number }>("SELECT id FROM teachers WHERE user_id = ?", u.id);
    if (t) {
      const own = await all<{ name: string }>("SELECT name FROM classes WHERE class_teacher_id = ? AND year = ? ORDER BY grade, name", t.id, year);
      if (own.length) details.push({ label: "Class teacher", value: own.map((c) => `Class ${c.name}`).join(", ") });
      const subs = await all<{ subject: string; classes: string }>(`SELECT s.name subject, string_agg(c.name, ', ' ORDER BY c.grade, c.name) classes
        FROM class_subjects cs JOIN subjects s ON s.id = cs.subject_id JOIN classes c ON c.id = cs.class_id
        WHERE cs.teacher_id = ? AND c.year = ? GROUP BY s.name ORDER BY s.name`, t.id, year);
      if (subs.length) details.push({ label: "Teaches", value: subs.map((s) => `${s.subject} (${s.classes})`).join("; ") });
    }
  } else if (u.role === "learner") {
    const l = await get<{ name: string | null; grade: number | null }>("SELECT c.name, c.grade FROM learners l LEFT JOIN classes c ON c.id = l.class_id WHERE l.user_id = ?", u.id);
    if (l?.name != null && l.grade != null) details.push({ label: "Class", value: `${gradeLabel(l.grade)} · Class ${l.name}` });
  } else if (u.role === "parent" && staff) {
    const kids = await all<{ first_name: string; last_name: string; name: string | null }>(`SELECT l.first_name, l.last_name, c.name FROM guardian_links g
      JOIN learners l ON l.id = g.learner_id LEFT JOIN classes c ON c.id = l.class_id WHERE g.parent_user_id = ? AND l.status = 'Active' ORDER BY l.first_name`, u.id);
    if (kids.length) details.push({ label: kids.length === 1 ? "Child" : "Children", value: kids.map((k) => `${k.first_name} ${k.last_name}${k.name ? ` (${k.name})` : ""}`).join(", ") });
  }

  const s = u.school_id ? await get<{ id: number; name: string; logo_updated_at: string | null }>("SELECT id, name, logo_updated_at FROM schools WHERE id = ?", u.school_id) : null;
  return {
    first_name: u.first_name, last_name: u.last_name, name: fullName(u, true), role: ROLE_LABEL[u.role] ?? u.role,
    photo: avatarUrl(u.id, u.avatar_updated_at), banner: bannerUrl(u.id, u.banner_updated_at), details,
    school: s ? { ...s, logo: logoUrl(s.id, s.logo_updated_at) } : null,
  };
}
