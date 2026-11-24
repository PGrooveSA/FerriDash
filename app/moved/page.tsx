import StatusPage from "@/components/StatusPage";

export const metadata = { title: "FerriDash has moved" };

/** Where the old address forwards to. */
const NEW_HOME = "https://www.ferridash.co.za";

// Shown on FerriDash's old address (middleware.ts rewrites every request there to this page).
// The same page on the new address, after a few seconds or straight away with the button.
export default async function MovedPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const to = (await searchParams).to;
  // Only a path on FerriDash itself (never another site).
  const path = typeof to === "string" && to.startsWith("/") && !to.startsWith("//") ? to : "/";
  const target = NEW_HOME + path;
  return (
    <>
      <meta httpEquiv="refresh" content={`6;url=${target}`} />
      <StatusPage
        title="FerriDash has moved"
        message={<>FerriDash now lives at <b>www.ferridash.co.za</b>. Your account, school and information are exactly the same: just sign in there.</>}
        action={{ href: target, label: "Go to www.ferridash.co.za" }}
        note="You'll be taken there automatically in a few seconds. Please update your bookmarks."
      />
    </>
  );
}
