"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Building2, GraduationCap, Users, UsersRound, BookOpen, CalendarCheck, Award, FileBarChart,
  Wallet, Megaphone, CalendarDays, Library, MessageSquare, UserCircle, Settings, LogOut, ChevronDown, X, Menu,
} from "lucide-react";
import { logout } from "@/app/actions/auth";

type Role = "super_admin" | "school_admin" | "teacher" | "learner" | "parent";
type Item = { href: string; label: string; icon: typeof LayoutDashboard; roles: Role[]; children?: { href: string; label: string; roles?: Role[] }[] };

const STAFF: Role[] = ["super_admin", "school_admin", "teacher"];
const ADMIN: Role[] = ["super_admin", "school_admin"];
const ALL: Role[] = ["super_admin", "school_admin", "teacher", "learner", "parent"];
const FAMILY: Role[] = ["learner", "parent"];

const MENU: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ALL },
  { href: "/schools", label: "Schools", icon: Building2, roles: ["super_admin"] },
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
    ],
  },
  {
    href: "/reports", label: "Reports", icon: FileBarChart, roles: ALL,
    children: [
      { href: "/reports", label: "All Reports", roles: STAFF },
      { href: "/reports/report-cards", label: "Report Cards" },
      { href: "/reports/broadsheet", label: "Broadsheet", roles: STAFF },
      { href: "/reports/promotion", label: "Promotion Schedule", roles: STAFF },
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
  { href: "/notices", label: "Notice", icon: Megaphone, roles: ALL },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, roles: ALL },
  { href: "/library", label: "Library", icon: Library, roles: ALL },
  { href: "/messages", label: "Message", icon: MessageSquare, roles: ALL },
];

const OTHER: Item[] = [
  { href: "/profile", label: "Profile", icon: UserCircle, roles: ALL },
  { href: "/settings", label: "Setting", icon: Settings, roles: ADMIN },
];

export default function Sidebar({ role, schoolName }: { role: Role; schoolName: string }) {
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
    const base = "flex items-center gap-3 rounded-2xl px-4 py-2.5 text-[0.92rem] font-medium transition-colors";
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
                  <Link href={c.href} className={`block rounded-xl px-3 py-1.5 text-sm ${path === c.href ? "font-semibold text-[var(--ink)] bg-white/50 dark:bg-white/5" : "muted hover:text-[var(--ink)]"}`}>{c.label}</Link>
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
      <div className="flex items-center gap-3 px-3 pt-2 pb-6">
        <img src="/icon.svg" alt="" className="w-9 h-9" />
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight leading-none">Sekolo</p>
          <p className="text-[0.7rem] muted truncate mt-1">{schoolName}</p>
        </div>
        <button className="ml-auto lg:hidden icon-btn" onClick={() => setOpen(false)} aria-label="Close menu"><X className="w-4 h-4" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto pr-1 -mr-1">
        <p className="px-4 text-[0.7rem] font-semibold tracking-widest muted mb-2">MENU</p>
        <ul className="space-y-0.5">{MENU.filter((m) => m.roles.includes(role)).map(renderItem)}</ul>
        <p className="px-4 text-[0.7rem] font-semibold tracking-widest muted mt-6 mb-2">OTHER</p>
        <ul className="space-y-0.5">
          {OTHER.filter((m) => m.roles.includes(role)).map(renderItem)}
          <li>
            <form action={logout}>
              <button className="flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-[0.92rem] font-medium muted hover:bg-rose-500/10 hover:text-rose-600">
                <LogOut className="w-[1.15rem] h-[1.15rem]" /> Log out
              </button>
            </form>
          </li>
        </ul>
      </nav>
      <div className="mt-4 rounded-3xl p-5 text-white relative overflow-hidden bg-gradient-to-br from-brand-400 via-brand-500 to-gold-500">
        <div className="absolute -right-8 -bottom-10 w-32 h-32 rounded-full bg-white/20 blur-xl" />
        <p className="font-semibold leading-snug relative">CAPS results made simple</p>
        <p className="text-xs text-white/85 mt-1 relative">Capture marks, moderate and publish report cards in one place.</p>
      </div>
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
