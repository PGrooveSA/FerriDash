/**
 * A plain, always-light status page (page moved, not found, something went wrong). It never shows error
 * codes, IDs or technical links: those stay in the Vercel logs. People are pointed to support instead.
 * Works in server and client components (no hooks); styles in app/globals.css (.status-*).
 */
export const SUPPORT_EMAIL = "support@ferridash.co.za";

export default function StatusPage({ title, message, action, note }: {
  title: string;
  message: React.ReactNode;
  /** The main button: a link, or a button rendered by the caller (e.g. "Try again"). */
  action?: { href: string; label: string } | React.ReactNode;
  note?: React.ReactNode;
}) {
  const isLink = (a: unknown): a is { href: string; label: string } => !!a && typeof a === "object" && "href" in (a as object);
  return (
    <main className="status-page">
      <div className="status-card">
        <img src="/brand/ferridash-logo-light.svg" alt="FerriDash" width={563} height={132} className="status-logo" />
        <h1>{title}</h1>
        <p className="status-message">{message}</p>
        {isLink(action) ? <a href={action.href} className="status-button">{action.label}</a> : action}
        {note && <p className="status-note">{note}</p>}
        <p className="status-help">Need help? Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a></p>
      </div>
      <p className="status-foot">Copyright © Infinite Q Graphics</p>
    </main>
  );
}
