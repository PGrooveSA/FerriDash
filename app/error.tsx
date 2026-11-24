"use client";
import StatusPage from "@/components/StatusPage";

// Any page that fails while loading. The details are in the Vercel logs, never on screen.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <StatusPage
      title="Something went wrong"
      message="This page couldn't load just now. Please try again in a moment."
      action={<button type="button" className="status-button" onClick={() => reset()}>Try again</button>}
      note={<a href="/">Go to FerriDash</a>}
    />
  );
}
