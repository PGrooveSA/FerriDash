import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, EFFECTIVE } from "./docs";

// Public legal documents (middleware lets /legal through without a login), laid out like a formal
// printed school policy: plain black text in Gill Sans, a reference number, a table of contents and
// numbered clauses. No colours, gradients, borders or shadows.
export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }) {
  return { title: DOCS[(await params).doc]?.title ?? "Legal" };
}

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const key = (await params).doc;
  const doc = DOCS[key];
  if (!doc) notFound();
  const other = key === "privacy" ? { href: "/legal/terms", label: "Terms and Conditions" } : { href: "/legal/privacy", label: "Privacy Policy" };
  return (
    <main className="legal-doc">
      <div className="legal-page">
        <nav className="legal-nav"><Link href="/">Back to FerriDash</Link><Link href={other.href}>{other.label}</Link></nav>
        <img src="/brand/ferridash-logo-light.svg" alt="FerriDash" width={563} height={132} className="legal-logo" />
        <h1>{doc.title}</h1>
        <p className="legal-ref">({doc.ref})</p>
        <p className="legal-intro">{doc.intro}</p>

        <h2 className="legal-toc-title">Table of Contents</h2>
        <ol className="legal-toc">
          {doc.sections.map((s, i) => (
            <li key={s.title}><a href={`#s${i + 1}`}><span>{i + 1}.</span><span>{s.title.toUpperCase()}</span></a></li>
          ))}
        </ol>

        {doc.sections.map((s, i) => (
          <section key={s.title} id={`s${i + 1}`}>
            <h2><span>{i + 1}.</span>{s.title.toUpperCase()}</h2>
            {s.clauses.map((c, j) => (
              <div key={j}>
                <p className="legal-clause"><span>{i + 1}.{j + 1}.</span><span>{c.t}</span></p>
                {c.sub?.map((x, k) => <p key={k} className="legal-sub"><span>{i + 1}.{j + 1}.{k + 1}.</span><span>{x}</span></p>)}
              </div>
            ))}
          </section>
        ))}

        <p className="legal-foot">({doc.ref}) · Effective {EFFECTIVE} · Copyright © Infinite Q Graphics</p>
      </div>
    </main>
  );
}
