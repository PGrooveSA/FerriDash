import Link from "next/link";
import { notFound } from "next/navigation";

const DOCS: Record<string, { title: string; body: [string, string][] }> = {
  privacy: {
    title: "Privacy Policy (POPIA)",
    body: [
      ["Responsible party", "Each school using Sekolo is the responsible party for the personal information of its learners, parents and staff. Sekolo processes that information on the school's behalf as an operator under the Protection of Personal Information Act 4 of 2013 (POPIA)."],
      ["What we collect", "Names, contact details, South African ID or birth certificate numbers, class placement, attendance, assessment marks, report comments, fee accounts and messages sent through the platform."],
      ["Children's information", "Learners are mostly minors. Their information is processed with the consent of a competent person (parent or guardian) or as required for the school to meet its obligations under the South African Schools Act."],
      ["Who can see it", "Access is role-based: educators see their own classes, parents see only their own children, learners see only themselves, and results are visible to families only after the school publishes them."],
      ["Security", "Passwords are hashed, sessions expire, every mark change is written to an audit trail, and each school's data is separated from other schools."],
      ["Your rights", "You may ask the school to access, correct or delete your personal information, and you may lodge a complaint with the Information Regulator (inforegulator.org.za)."],
    ],
  },
  terms: {
    title: "Terms of Use",
    body: [
      ["Use of the platform", "Sekolo is provided to schools to manage learners, results, attendance, finances and communication. Users must keep their login details confidential and use the system only for school purposes."],
      ["Results", "CAPS calculations and promotion outcomes are produced automatically from captured marks to support, not replace, the school's official processes. Schools remain responsible for verifying results against current Department of Basic Education policy."],
      ["Acceptable use", "Do not share other people's information, upload unlawful content, or attempt to access data you are not authorised to see."],
      ["Ownership", "Sekolo software and design: Copyright © Infinite Q Graphics. School data remains the property of the school."],
    ],
  },
};

export default async function LegalPage({ params }: { params: Promise<{ doc: string }> }) {
  const doc = DOCS[(await params).doc];
  if (!doc) notFound();
  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8">
      <article className="glass p-6 sm:p-10">
        <Link href="/dashboard" className="text-sm muted hover:underline">← Back to Sekolo</Link>
        <h1 className="text-3xl font-bold tracking-tight mt-4">{doc.title}</h1>
        <div className="space-y-5 mt-6">{doc.body.map(([h, p]) => <section key={h}><h2 className="font-semibold">{h}</h2><p className="muted text-sm mt-1 leading-relaxed">{p}</p></section>)}</div>
        <p className="text-xs muted mt-10">Copyright © Infinite Q Graphics</p>
      </article>
    </main>
  );
}
