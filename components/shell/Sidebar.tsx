"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, GraduationCap, Users, UsersRound, BookOpen, CalendarCheck, Award, FileBarChart,
  Wallet, Megaphone, CalendarDays, Library, MessageSquare, UserCircle, Settings, Upload, LogOut, ChevronDown, X, Menu, ClipboardList,
} from "lucide-react";
import { logout } from "@/app/actions/auth";
import SchoolCrest from "@/components/SchoolCrest";
import BrandLogo from "@/components/BrandLogo";

type Role = "super_admin" | "school_admin" | "teacher" | "learner" | "parent";
type Item = { href: string; label: string; icon: typeof LayoutDashboard; roles: Role[]; children?: { href: string; label: string; roles?: Role[] }[] };

// School menus. The platform admin (super_admin) only gets the schools dashboard and their profile.
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
    href: "/finance", label: "Finance", icon: Wallet, roles: [...ADMIN, "parent"],
    children: [
      { href: "/finance/fees", label: "Fees Collection", roles: ADMIN },
      { href: "/finance/expenses", label: "School Expenses", roles: ADMIN },
      { href: "/finance/statement", label: "Fee Statement", roles: ["parent"] },
    ],
  },
  { href: "/assignments", label: "Assignments", icon: ClipboardList, roles: ALL },
  { href: "/notices", label: "Notice", icon: Megaphone, roles: ALL },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, roles: ALL },
  { href: "/library", label: "Library", icon: Library, roles: ALL },
  { href: "/messages", label: "Message", icon: MessageSquare, roles: ALL },
];

const OTHER: Item[] = [
  { href: "/profile", label: "Profile", icon: UserCircle, roles: EVERYONE },
  { href: "/import", label: "Import Data", icon: Upload, roles: ADMIN },
  { href: "/settings", label: "Setting", icon: Settings, roles: ADMIN },
];

export default function Sidebar({ role, school }: { role: Role; school: { id: number; name: string; logo_updated_at: string | null } | null }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    const parent = MENU.find((m) => m.children && path.startsWith(m.href));
    if (parent) setExpanded(parent.href);
  }, [path]);

  const isActive = (href: string) => (href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/"));

  const renderItem = (item: Item) => {
    const Icon = item.icon;
    const kids = item.children?.filter((c) => !c.roles || c.roles.includes(role));
    const active = isActive(item.href);
    const base = "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-base font-normal transition-colors";
    const cls = active ? `${base} bg-gradient-to-r from-brand-200/90 to-gold-200/70 text-slate-900 dark:from-brand-500/25 dark:to-gold-500/20 dark:text-white shadow-sm` : `${base} muted hover:bg-white/50 dark:hover:bg-white/5 hover:text-[var(--ink)]`;
    if (kids && kids.length > 1) {
      const isOpen = expanded === item.href;
      return (
        <li key={item.href}>
          <button type="button" onClick={() => setExpanded(isOpen ? null : item.href)} className={`${cls} w-full`} aria-expanded={isOpen}>
            <Icon className="w-[1.15rem] h-[1.15rem]" /> <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
          {isOpen && (
            <ul className="ml-6 mt-1 mb-1 border-l-2 border-brand-200 dark:border-brand-500/30 pl-3 space-y-0.5">
              {kids.map((c) => (
                <li key={c.href}>
                  <Link href={c.href} className={`block rounded-xl px-3 py-1.5 text-[0.95rem] font-normal ${path === c.href ? "text-[var(--ink)] bg-white/50 dark:bg-white/10" : "muted hover:text-[var(--ink)]"}`}>{c.label}</Link>
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
          <Icon className="w-[1.15rem] h-[1.15rem]" /> {item.label}
        </Link>
      </li>
    );
  };

  const nav = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 pt-1 pb-4">
        <Link href="/dashboard" aria-label="FerriDash: go to dashboard" className="rounded-lg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-500">
          <BrandLogo className="w-[9.5rem]" />
        </Link>
        <button className="ml-auto lg:hidden icon-btn" onClick={() => setOpen(false)} aria-label="Close menu"><X className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-3 mx-1 mb-5 p-2.5 rounded-2xl bg-white/45 dark:bg-white/5 border border-white/60 dark:border-white/10">
        {school ? <>
          <SchoolCrest school={school} size={44} zoom />
          <p className="text-sm font-semibold leading-snug line-clamp-2">{school.name}</p>
        </> : <>
          <span className="w-11 h-11 rounded-xl grid place-items-center bg-brand-500/15 text-brand-600 shrink-0"><Building2 className="w-5 h-5" /></span>
          <p className="text-sm font-semibold leading-snug">Platform admin<span className="block text-xs muted font-normal">All schools</span></p>
        </>}
      </div>
      <nav className="flex-1 overflow-y-auto pr-1 -mr-1">
        <p className="px-4 text-[0.7rem] font-normal tracking-widest muted mb-2">MENU</p>
        <ul className="space-y-0.5">{MENU.filter((m) => m.roles.includes(role)).map(renderItem)}</ul>
        <p className="px-4 text-[0.7rem] font-normal tracking-widest muted mt-6 mb-2">OTHER</p>
        <ul className="space-y-0.5">
          {OTHER.filter((m) => m.roles.includes(role)).map(renderItem)}
          <li>
            <form action={logout}>
              <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-base font-normal muted hover:bg-rose-500/10 hover:text-rose-600">
                <LogOut className="w-[1.15rem] h-[1.15rem]" /> Log out
              </button>
            </form>
          </li>
        </ul>
      </nav>
    </div>
  );

  return (
    <>
      <button className="lg:hidden fixed top-4 left-4 z-40 icon-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="w-5 h-5" /></button>
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
