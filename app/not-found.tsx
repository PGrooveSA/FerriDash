import StatusPage from "@/components/StatusPage";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <StatusPage
      title="Page not found"
      message="We couldn't find the page you were looking for. It may have moved, or the link may be incomplete."
      action={{ href: "/", label: "Go to FerriDash" }}
    />
  );
}
