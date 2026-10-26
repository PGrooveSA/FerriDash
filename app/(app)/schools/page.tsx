import { redirect } from "next/navigation";

// School management now lives on the platform admin's dashboard.
export default function SchoolsPage() {
  redirect("/dashboard");
}
