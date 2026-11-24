// Text of FerriDash's public legal documents (/legal/privacy and /legal/terms).
// Written in the numbered style of a formal school policy: sections 1., clauses 1.1., sub-items 1.1.1.
// Facts here must match the app: where data is stored (vercel.json region cdg1, Supabase eu-west-3 Paris),
// the services used (lib/payfast.ts, lib/ozow.ts, lib/push.ts), the cookies (lib/session.ts), sessions
// (12 hours, 30 days with "Remember me") and the 15-minute lock after repeated wrong passwords.

/** Contact details printed in both documents.
 * DEMO VALUES: the officer, phone and address are made-up placeholders until the real ones are supplied. */
export const OWNER = {
  name: "Infinite Q Graphics",
  officer: "Thandiwe Mokoena",
  email: "privacy@ferridash.co.za",
  phone: "+27 (0)11 000 0000",
  address: "1 Demo Office Park, 100 Example Road, Sandton, Johannesburg, 2196",
  website: "ferridash.co.za",
};

export const EFFECTIVE = "24 November 2026";

export type Clause = { t: string; sub?: string[] };
export type Section = { title: string; clauses: Clause[] };
export type LegalDoc = { title: string; ref: string; intro: string; sections: Section[] };

const contact = [
  `Information Officer: ${OWNER.officer}`,
  `Organisation: ${OWNER.name} (FerriDash)`,
  `Email: ${OWNER.email}`,
  `Phone: ${OWNER.phone}`,
  `Address: ${OWNER.address}`,
];

export const DOCS: Record<string, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    ref: "FD-PP-2026-01",
    intro: "This Policy explains, in plain language, how FerriDash collects, uses, shares and protects personal information, and what rights you have. It applies to everyone who uses FerriDash: school and crèche staff, parents and guardians, learners and people who apply to a school through FerriDash.",
    sections: [
      {
        title: "Policy statement",
        clauses: [
          { t: `FerriDash is a school and childcare management platform owned and operated by ${OWNER.name} ("FerriDash", "we", "us"). Schools and early childhood development centres ("schools") use it to manage learners, attendance, marks, report cards, homework, fees and messages.` },
          { t: "Every person has the right to privacy. We are committed to handling personal information lawfully, fairly and securely, in line with the Protection of Personal Information Act 4 of 2013 (\"POPIA\") and its regulations." },
          { t: "Where a person in the European Union uses FerriDash, we also respect the principles of the European Union General Data Protection Regulation (\"GDPR\")." },
          { t: "We never sell personal information, and we never use it for advertising or marketing." },
        ],
      },
      {
        title: "Definitions of terms used in this policy",
        clauses: [
          { t: "\"Personal information\" means information about an identifiable, living person or an existing company, such as a name, identity number, contact details, marks or attendance." },
          { t: "\"Special personal information\" means more sensitive information, such as a child's health or allergy details, religious beliefs or biometric information. It is protected by stricter rules." },
          { t: "\"Processing\" means anything done with personal information, including collecting, storing, using, sharing, correcting and deleting it." },
          { t: "\"Responsible party\" means the organisation that decides why and how personal information is processed." },
          { t: "\"Operator\" means an organisation that processes personal information for a responsible party under a contract, without coming under its direct authority." },
          { t: "\"Competent person\" means a person legally able to consent on behalf of a child, usually a parent or guardian." },
        ],
      },
      {
        title: "Who is responsible for your information",
        clauses: [
          { t: "Each school that uses FerriDash is the responsible party for the personal information of its learners, parents, guardians and staff. The school decides what information is captured and who may see it." },
          { t: "FerriDash is the operator for that information (POPIA, section 1). We process it only on the school's instructions and only to provide the FerriDash service to that school (POPIA, sections 20 and 21)." },
          { t: "FerriDash is the responsible party only for the information we collect for ourselves, such as a school's billing contact details and support requests." },
          { t: "Questions or requests about a learner's information should usually go to the school first. We help the school to answer them." },
        ],
      },
      {
        title: "Information we collect",
        clauses: [
          {
            t: "Learner information:",
            sub: [
              "names, date of birth, gender, identity or birth certificate number, home language, address and admission number;",
              "grade, class, subjects, attendance, marks, assessments, report comments and report cards;",
              "homework and assignments, notices and messages;",
              "for crèches: check-in and pickup times, who collected the child, and health and allergy details provided by the parent.",
            ],
          },
          { t: "Parent and guardian information: names, relationship to the learner, email address, cell number, the learners linked to the account, and fee statements and payment records." },
          { t: "Staff information: names, title, contact details, staff number, PERSAL and SACE numbers, post level, employment date and the classes and subjects they teach." },
          { t: "Applicant information: details that parents enter in a school's online application form, together with their consent to the school processing it." },
          {
            t: "Technical information:",
            sub: [
              "sign-in records, including failed sign-in attempts;",
              "the IP address and browser type of a request, recorded only when something looks suspicious (for example repeated wrong passwords);",
              "an audit trail of changes to marks and other school records;",
              "a device token when you allow notifications in the FerriDash mobile app.",
            ],
          },
          { t: "We collect only what a school needs to run its day-to-day work. We do not collect card or bank details: online payments are completed on the payment provider's own secure page." },
        ],
      },
      {
        title: "How we use the information",
        clauses: [
          {
            t: "We use personal information only to:",
            sub: [
              "let schools manage learners, classes, attendance, marks, report cards, homework, fees and messages;",
              "let parents see their own children's progress, homework, reports and fee statements, and pay fees online;",
              "let learners see their own information and work;",
              "send notifications that a school or teacher has chosen to send;",
              "keep accounts secure, detect misuse and investigate problems;",
              "meet our legal obligations.",
            ],
          },
          { t: "We do not use learner information to build profiles, to make automated decisions about anyone, or for marketing." },
          { t: "CAPS calculations and promotion outcomes are worked out from the marks a school captures. They support, and do not replace, the school's own decisions." },
        ],
      },
      {
        title: "Children's information",
        clauses: [
          { t: "Most learners are children. POPIA allows a child's information to be processed with the consent of a competent person, or where it is needed for the school to meet its legal obligations, for example under the South African Schools Act 84 of 1996 (POPIA, sections 34 and 35)." },
          { t: "The school is responsible for obtaining that consent where it is required." },
          { t: "Parents can see only their own children. Learners can see only their own information." },
          { t: "Health and allergy information is special personal information. POPIA allows schools to process it where it is needed to support a learner or make arrangements for the learner's health (section 32). In FerriDash only the staff who care for the child can see it." },
        ],
      },
      {
        title: "Who can see the information",
        clauses: [
          { t: "Access is based on each person's role: educators see the classes they teach, school administrators see their own school, parents see their own children and learners see themselves." },
          { t: "Each school's information is kept separate from every other school's." },
          { t: "Results become visible to families only after the school publishes them." },
          { t: "When a learner leaves or matriculates, the school can move the record to its Passed Out Archive. Logins for that learner and parent are then switched off." },
        ],
      },
      {
        title: "Service providers and where information is kept",
        clauses: [
          {
            t: "We use a small number of trusted service providers (operators) to run FerriDash. Each receives only the information it needs:",
            sub: [
              "Vercel Inc.: hosts the FerriDash website and application, on servers in Paris, France;",
              "Supabase Inc.: stores the database and uploaded files (such as school logos and documents), on servers in Paris, France;",
              "PayFast and Ozow: process online fee payments on their own secure pages; FerriDash receives only the payment result;",
              "Google Firebase Cloud Messaging and Apple Push Notification service: deliver notifications to the FerriDash mobile app.",
            ],
          },
          { t: "Because our servers are in France, personal information is transferred outside South Africa. POPIA allows this where the recipient is subject to laws that give an adequate level of protection (section 72). France is bound by the GDPR, which offers protection comparable to POPIA." },
          { t: "We may also disclose information where the law requires it, for example to comply with a court order." },
        ],
      },
      {
        title: "Security",
        clauses: [
          {
            t: "We protect personal information with appropriate technical and organisational measures (POPIA, section 19), including:",
            sub: [
              "encrypted connections (HTTPS) between your device and FerriDash;",
              "stored data encrypted by our database provider;",
              "passwords stored only as one-way hashes, never as readable text;",
              "sessions that end after 12 hours, or after 30 days if you choose \"Remember me\";",
              "an account lock of 15 minutes after repeated wrong passwords, with limits on repeated attempts;",
              "protection against forged sign-in and form requests;",
              "role-based access and separation between schools;",
              "an audit trail of changes to marks and records, and logs of suspicious activity;",
              "checks on uploaded files.",
            ],
          },
          { t: "Keep your password private and sign out on shared devices. Passwords are reset by your school office, never by email from FerriDash." },
          { t: "No system is completely secure. If we believe someone has accessed personal information without authority, we will tell the school immediately (POPIA, section 21). The school will notify the Information Regulator and the people affected as soon as reasonably possible (section 22), and we will help it do so." },
        ],
      },
      {
        title: "Cookies and similar technologies",
        clauses: [
          {
            t: "FerriDash uses only the cookies it needs to work:",
            sub: [
              "a sign-in cookie that keeps you signed in;",
              "a cookie that remembers which school you are working in;",
              "a short-lived cookie that protects the sign-in page against forged requests.",
            ],
          },
          { t: "Your browser also remembers whether you chose the light or dark look." },
          { t: "We do not use advertising cookies, tracking pixels or third-party analytics." },
        ],
      },
      {
        title: "How long we keep information",
        clauses: [
          { t: "We keep personal information only for as long as it is needed for the purpose it was collected for, or as the law requires (POPIA, section 14)." },
          {
            t: "In general:",
            sub: [
              "school records are kept while the school uses FerriDash, and for as long as the school's own record-keeping rules require;",
              "financial records are kept for five years, as South African tax law requires;",
              "security logs and sign-in attempt records are kept only for a short period;",
              "when a school stops using FerriDash, it may ask for a copy of its information within 30 days; we then delete it within 90 days, unless the law requires us to keep it.",
            ],
          },
        ],
      },
      {
        title: "Your rights",
        clauses: [
          {
            t: "Under POPIA you have the right to:",
            sub: [
              "be told that your personal information is being collected (section 18);",
              "ask whether we hold your information and request access to it (section 23);",
              "ask for it to be corrected or deleted (section 24);",
              "object to its processing on reasonable grounds (section 11(3));",
              "withdraw consent where processing is based on consent;",
              "complain to the Information Regulator (section 74).",
            ],
          },
          { t: "Most requests are best made to your school, which can correct records directly. You may also contact our Information Officer (section 13)." },
          { t: "We will respond within a reasonable time and may ask you to confirm your identity first." },
        ],
      },
      {
        title: "Information Officer",
        clauses: [
          { t: "Our Information Officer, as required by POPIA, can be contacted at:", sub: contact },
        ],
      },
      {
        title: "Complaints",
        clauses: [
          { t: "If you are unhappy with how your information has been handled, please contact your school or our Information Officer first so that we can try to resolve it." },
          {
            t: "You may also lodge a complaint with the Information Regulator of South Africa:",
            sub: ["Website: www.inforegulator.org.za", "POPIA complaints: POPIAComplaints@inforegulator.org.za", "General enquiries: inforeg@inforegulator.org.za"],
          },
        ],
      },
      {
        title: "Policy awareness and update",
        clauses: [
          { t: "We may update this Policy when the law or FerriDash changes. The effective date at the end shows when it was last changed." },
          { t: "We will tell schools about important changes before they take effect." },
        ],
      },
      {
        title: "Effective date",
        clauses: [{ t: `This Policy is effective from ${EFFECTIVE}.` }],
      },
    ],
  },

  terms: {
    title: "Terms and Conditions",
    ref: "FD-TC-2026-01",
    intro: "These Terms and Conditions set out the rules for using FerriDash. Please read them carefully. By signing in to FerriDash, you agree to them.",
    sections: [
      {
        title: "Acceptance of terms",
        clauses: [
          { t: `FerriDash is a school and childcare management platform owned and operated by ${OWNER.name} ("FerriDash", "we", "us").` },
          { t: "These Terms apply to every person who uses FerriDash (\"you\"), including school and crèche staff, parents, guardians and learners." },
          { t: "By signing in, you agree to these Terms and to our Privacy Policy, which forms part of them. Agreement in electronic form is valid under the Electronic Communications and Transactions Act 25 of 2002." },
          { t: "If you do not agree, do not use FerriDash and contact your school." },
          { t: "A learner under 18 may use FerriDash only with the permission of a parent or guardian, which the school arranges." },
        ],
      },
      {
        title: "Definitions",
        clauses: [
          { t: "\"School\" means a school or early childhood development centre that subscribes to FerriDash." },
          { t: "\"User\" means any person given a login by a school, or by FerriDash for a school." },
          { t: "\"School data\" means all information a school or its users put into FerriDash." },
          { t: "\"Service\" means the FerriDash website, the FerriDash mobile apps and all their features." },
        ],
      },
      {
        title: "Accounts and sign-in",
        clauses: [
          { t: "Your school creates your login. There is no public sign-up." },
          { t: "Keep your password private. You are responsible for everything done with your login." },
          { t: "Tell your school office immediately if you think someone else knows your password. For your security, passwords are reset only by your school." },
          { t: "Sign out when you use a shared or public device." },
          { t: "The school may switch off a login at any time, for example when a learner leaves or a staff member resigns." },
        ],
      },
      {
        title: "Permitted use",
        clauses: [
          { t: "We give each school and its users a limited, non-exclusive, non-transferable right to use FerriDash for the school's own educational and administrative purposes, for as long as the school's subscription is active." },
          {
            t: "You may not:",
            sub: [
              "access, or try to access, information you are not authorised to see;",
              "share another person's personal information outside the purpose it was given for;",
              "upload content that is unlawful, harmful, threatening, offensive or that infringes someone else's rights;",
              "upload viruses or other harmful code, or interfere with the Service or other users;",
              "copy, reverse-engineer, resell or sublicense FerriDash, or use automated tools to extract information from it;",
              "use FerriDash to send advertising or unsolicited messages.",
            ],
          },
          { t: "We may suspend a login that breaks these rules, and we will tell the school." },
        ],
      },
      {
        title: "Responsibilities of the school",
        clauses: [
          { t: "The school is the responsible party for its school data under POPIA, and must have a lawful basis, including any consent required, to capture it." },
          { t: "The school is responsible for the accuracy of the information it captures, and for deciding who receives a login and what each person may see." },
          { t: "CAPS calculations, report cards and promotion outcomes are produced automatically from captured marks. They support, and do not replace, the school's official processes. The school must check results against current Department of Basic Education requirements before publishing them." },
          { t: "Messages, notices and homework sent through FerriDash are the responsibility of the school and the staff member who sends them." },
        ],
      },
      {
        title: "School data and privacy",
        clauses: [
          { t: "The school owns its school data. We process it only to provide the Service, as described in our Privacy Policy." },
          { t: "We do not sell school data or use it for advertising." },
          { t: "When a school stops using FerriDash, it may ask for a copy of its data within 30 days. After that, we delete it within 90 days, unless the law requires us to keep it." },
        ],
      },
      {
        title: "Fees and online payments",
        clauses: [
          { t: "The FerriDash subscription fee, if any, is agreed between FerriDash and the school. Users are not charged for using FerriDash." },
          { t: "School fees shown in FerriDash are set by the school. Online fee payments are processed by independent payment providers on their own secure pages and are subject to their terms. FerriDash does not receive or store card or bank details." },
          { t: "Questions about fee amounts, statements, refunds or disputes must be directed to the school." },
        ],
      },
      {
        title: "Availability and support",
        clauses: [
          { t: "We work to keep FerriDash available and secure, but we cannot guarantee that it will always be uninterrupted or free of errors. Maintenance and updates may cause short interruptions." },
          { t: "Users should contact their school office first for help. Schools can contact FerriDash for technical support." },
        ],
      },
      {
        title: "Intellectual property",
        clauses: [
          { t: `The FerriDash software, name, logo, design and content (other than school data) belong to ${OWNER.name} and are protected by copyright and other laws.` },
          { t: "Nothing in these Terms gives you ownership of FerriDash, or the right to use its name or logo without written permission." },
        ],
      },
      {
        title: "Limitation of liability",
        clauses: [
          { t: "To the extent allowed by South African law, including the Consumer Protection Act 68 of 2008, FerriDash is not liable for any indirect or consequential loss, or for loss caused by a user's misuse of their login, by information a school captures incorrectly, or by events outside our reasonable control." },
          { t: "Our total liability to a school is limited to the subscription fees the school paid in the 12 months before the claim arose." },
          { t: "Nothing in these Terms limits any right you have that cannot lawfully be limited." },
        ],
      },
      {
        title: "Suspension and termination",
        clauses: [
          { t: "A school may stop using FerriDash in line with its subscription agreement." },
          { t: "We may suspend or end access for a user or a school that seriously breaches these Terms, or where the law requires it. Where reasonable, we will give notice first." },
        ],
      },
      {
        title: "Changes to these terms",
        clauses: [
          { t: "We may update these Terms when the law or FerriDash changes. The effective date at the end shows when they were last changed." },
          { t: "We will tell schools about important changes before they take effect. Continuing to use FerriDash after a change means you accept the updated Terms." },
        ],
      },
      {
        title: "General",
        clauses: [
          { t: "These Terms are governed by the laws of the Republic of South Africa, and the South African courts have jurisdiction." },
          { t: "If any part of these Terms is found to be unenforceable, the rest remains in force." },
          { t: "If we do not enforce a right immediately, we do not give it up." },
        ],
      },
      {
        title: "Contact details",
        clauses: [{ t: "For questions about these Terms, contact:", sub: contact }],
      },
      {
        title: "Effective date",
        clauses: [{ t: `These Terms are effective from ${EFFECTIVE}.` }],
      },
    ],
  },
};
