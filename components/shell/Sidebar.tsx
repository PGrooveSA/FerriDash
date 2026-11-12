"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useT } from "@/components/I18nProvider";
import {
  LayoutDashboard, Building2, GraduationCap, Users, UsersRound, BookOpen, CalendarCheck, Award, FileBarChart,
  Wallet, Megaphone, CalendarDays, Clock, MessageSquare, UserCircle, Settings, Palette, Upload, LogOut, ChevronDown, X, Menu, ClipboardList, Receipt, DoorOpen,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import SchoolCrest from "@/components/SchoolCrest";

type Role = "super_admin" | "school_admin" | "teacher" | "learner" | "parent";
/** What a school has switched on: fees (fee-paying schools with fee billing), reenrol (re-enrolment is open). */
type Feature = "fees" | "reenrol";
type Item = { href: string; label: string; icon: typeof LayoutDashboard; roles: Role[]; feature?: Feature; children?: { href: string; label: string; roles?: Role[]; feature?: Feature }[] };

// School menus. The platform admin (super_admin) only gets the schools dashboard, their profile and their theme.
const STAFF: Role[] = ["school_admin", "teacher"];
const ADMIN: Role[] = ["school_admin"];
const ALL: Role[] = ["school_admin", "teacher", "learner", "parent"];
const EVERYONE: Role[] = ["super_admin", ...ALL];
const FAMILY: Role[] = ["learner", "parent"];

const MENU: Item[] = [
  { href: "/dashboard", label: "Schools", icon: Building2, roles: ["super_admin"] },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { href: "/teachers", label: "Teachers", icon: GraduationCap, roles: ADMIN },
  { href: "/learners", label: "Learners", icon: Users, roles: STAFF },
  { href: "/parents", label: "Parents", icon: UsersRound, roles: ADMIN },
  { href: "/academics", label: "Classes & Subjects", icon: BookOpen, roles: ADMIN },
  { href: "/attendance", label: "Attendance", icon: CalendarCheck, roles: ALL },
  {
    href: "/results", label: "Results", icon: Award, roles: ALL,
    children: [
      { href: "/results", label: "Mark Entry", roles: STAFF },
      { href: "/results/moderation", label: "Moderation", roles: ADMIN },
      { href: "/results/analysis", label: "Analysis", roles: STAFF },
      { href: "/results/my", label: "My Results", roles: FAMILY },
      { href: "/records", label: "Academic Record", roles: FAMILY },
    ],
  },
  {
    href: "/reports", label: "Reports", icon: FileBarChart, roles: ALL,
    children: [
      { href: "/reports", label: "All Reports", roles: STAFF },
      { href: "/reports/report-cards", label: "Report Cards" },
      { href: "/reports/broadsheet", label: "Broadsheet", roles: STAFF },
      { href: "/reports/promotion", label: "Promotion Schedule", roles: STAFF },
      { href: "/reports/year-end", label: "Year-end Promotion", roles: ADMIN },
      { href: "/reports/attendance", label: "Attendance Report", roles: STAFF },
      { href: "/reports/finance", label: "Finance Report", roles: ADMIN },
    ],
  },
  {
    // Every school keeps School Expenses; fees only show for fee-paying schools with fee billing.
    href: "/finance", label: "Finance", icon: Wallet, roles: ADMIN,
    children: [
      { href: "/finance/fees", label: "Fees Collection", roles: ADMIN, feature: "fees" },
      { href: "/finance/settings", label: "Fee Settings", roles: ADMIN, feature: "fees" },
      { href: "/finance/expenses", label: "School Expenses", roles: ADMIN },
    ],
  },
  { href: "/finance/statement", label: "Fees", icon: Receipt, roles: ["parent"], feature: "fees" },
  {
    href: "/admissions", label: "Admissions", icon: DoorOpen, roles: ADMIN,
    children: [
      { href: "/admissions", label: "Applications", roles: ADMIN },
      { href: "/admissions/reenrol", label: "Re-enrolment", roles: ADMIN },
    ],
  },
  { href: "/admissions/reenrol", label: "Re-enrolment", icon: DoorOpen, roles: ["parent"], feature: "reenrol" },
  { href: "/assignments", label: "Assignments", icon: ClipboardList, roles: ALL },
  { href: "/notices", label: "Notices", icon: Megaphone, roles: ALL },
  { href: "/timetable", label: "Timetable", icon: Clock, roles: ALL },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, roles: ALL },
  { href: "/messages", label: "Messages", icon: MessageSquare, roles: ALL },
];

const OTHER: Item[] = [
  { href: "/profile", label: "Profile", icon: UserCircle, roles: EVERYONE },
  { href: "/import", label: "Import Data", icon: Upload, roles: ADMIN },
  { href: "/settings", label: "Settings", icon: Settings, roles: ADMIN },
  { href: "/appearance", label: "Appearance", icon: Palette, roles: ["super_admin", "school_admin"] },
];

export default function Sidebar({ role, school, features = [] }: { role: Role; school: { id: number; name: string; logo_updated_at: string | null } | null; features?: Feature[] }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const t = useT();

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const parent = MENU.find((m) => m.children && path.startsWith(m.href));
    if (parent) setExpanded(parent.href);
  }, [path]);

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/"));

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const kids = item.children?.filter((c) => (!c.roles || c.roles.includes(role)) && (!c.feature || features.includes(c.feature)));
    const active = isActive(item.href);
    const base = "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-base font-normal transition-all duration-300";
    const cls = `${base} ${active ? "nav-active" : "nav-idle"}`;
    if (kids && kids.length > 1) {
      const isOpen = expanded === item.href;
      return (
        <li key={item.href}>
          <button type="button" onClick={() => setExpanded(isOpen ? null : item.href)} className={`${cls} w-full`} aria-expanded={isOpen}>
            <Icon className="w-[1.15rem] h-[1.15rem]" /> <span className="flex-1 text-left">{t(item.label)}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {isOpen && (
            <ul className="ml-6 mt-1 mb-1 border-l-2 border-brand-200 dark:border-brand-500/30 pl-3 space-y-0.5">
              {kids.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className={`block rounded-xl px-3 py-1.5 text-[0.95rem] font-normal ${path === c.href ? "text-[var(--ink)] bg-white/50 dark:bg-white/10" : "muted hover:text-[var(--ink)]"}`}>{t(c.label)}</Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      );
    }
    return (
      <li key={item.href}>
        <Link href={kids?.[0]?.href ?? item.href} className={cls}>
          <Icon className="w-[1.15rem] h-[1.15rem]" /> {t(item.label)}
        </Link>
      </li>
    );
  };

  const nav = (
    <div className="flex flex-col h-full">
      {/* The school's own logo and name head the menu (the platform admin sees the platform instead). */}
      <div className="relative mx-1 mb-5 px-3 pt-4 pb-3.5 rounded-3xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10 flex flex-col items-center text-center gap-2.5">
        <button className="absolute top-2 right-2 lg:hidden icon-btn !w-8 !h-8" onClick={() => setOpen(false)} aria-label={t("Close menu")}><X className="w-4 h-4" /></button>
        {school ? <>
          <SchoolCrest school={school} size={76} zoom />
          <Link href="/dashboard" className="text-[0.95rem] font-semibold leading-snug hover:text-brand-600 transition-colors">{school.name}</Link>
        </> : <>
          <span className="w-[4.75rem] h-[4.75rem] rounded-[28%] grid place-items-center bg-brand-500/15 text-brand-600"><Building2 className="w-8 h-8" /></span>
          <Link href="/dashboard" className="text-[0.95rem] font-semibold leading-snug hover:text-brand-600 transition-colors">{t("Platform admin")}<span className="block text-xs muted font-normal">{t("All schools")}</span></Link>
        </>}
      </div>
      <nav className="flex-1 overflow-y-auto pr-1 -mr-1">
        <p className="px-4 text-[0.7rem] font-normal tracking-widest muted mb-2">{t("MENU")}</p>
        <ul className="space-y-0.5">{MENU.filter((m) => m.roles.includes(role) && (!m.feature || features.includes(m.feature))).map(renderItem)}</ul>
        <p className="px-4 text-[0.7rem] font-normal tracking-widest muted mt-6 mb-2">{t("OTHER")}</p>
        <ul className="space-y-0.5">
          {OTHER.filter((m) => m.roles.includes(role)).map(renderItem)}
          <li>
            <form action={logout}>
              <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-base font-normal muted hover:bg-rose-500/10 hover:text-rose-600">
                <LogOut className="w-[1.15rem] h-[1.15rem]" /> {t("Log out")}
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );

  return (
    <>
      <button className="lg:hidden fixed top-4 left-4 z-40 icon-btn" onClick={() => setOpen(true)} aria-label={t("Open menu")}><Menu className="w-5 h-5" /></button>
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-[17rem] p-4 z-30">
        <div className="glass-strong h-full rounded-[1.75rem] p-4">{nav}</div>
      </aside>
      {open && (
        <div className="lg:hidden fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <aside className="absolute inset-y-0 left-0 w-[17rem] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="glass-solid h-full p-4">{nav}</div>
          </aside>
        </div>
      )}
    </>
  );
}
