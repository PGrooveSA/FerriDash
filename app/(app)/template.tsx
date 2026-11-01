"use client";
import { usePathname } from "next/navigation";

// Each section of the app comes in with its own transition (globals.css: .page-enter). First match wins.
const ANIM: [string, string][] = [
  ["/dashboard", "rise"],
  ["/teachers", "slide"], ["/learners", "slide"], ["/parents", "slide"], ["/schools", "slide"],
  ["/academics", "reveal"], ["/timetable", "reveal"], ["/calendar", "reveal"],
  ["/attendance", "drop"], ["/notices", "drop"], ["/assignments", "drop"],
  ["/results", "zoom"], ["/reports", "zoom"], ["/records", "zoom"],
  ["/finance", "slide-left"],
  ["/admissions", "flip"],
  ["/messages", "blur"], ["/profile", "blur"], ["/settings", "blur"], ["/appearance", "blur"], ["/import", "blur"], ["/search", "blur"],
];

/** A template remounts on every navigation, so the page's blocks animate in each time. */
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const anim = ANIM.find(([p]) => path === p || path.startsWith(p + "/"))?.[1] ?? "rise";
  return <div className="page-enter" data-anim={anim}>{children}</div>;
}
