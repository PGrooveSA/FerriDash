"use client";
import "./globals.css";
import StatusPage from "@/components/StatusPage";

// When even the main layout fails: a complete page of its own. No error details on screen.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en-ZA">
      <body>
        <StatusPage
          title="Something went wrong"
          message="FerriDash couldn't load just now. Please try again in a moment."
          action={<button type="button" className="status-button" onClick={() => reset()}>Try again</button>}
        />
      </body>
    </html>
  );
}
