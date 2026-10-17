import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import {
  DATA_CONTROLLER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  NDPC_NAME,
  NDPC_URL,
  SUB_PROCESSORS,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How LedgerAI stores your statement data, how it is isolated per user, your rights under the Nigeria Data Protection Act, and how to export or delete your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated={LEGAL_UPDATED}>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          What this project is
        </h2>
        <p>
          LedgerAI is a portfolio and demonstration project, not a commercial
          accounting service. It is built to show how bank statements can be
          turned into clean books, reports, and insights. Please do not upload
          sensitive or real financial data you would not be comfortable having
          processed by a demo.
        </p>
        <p>
          This notice explains what personal data LedgerAI processes, why, who
          it is shared with, how it is protected, and the rights you have under
          the Nigeria Data Protection Act 2023 (the &ldquo;NDPA&rdquo;) and the
          Nigeria Data Protection Regulation. The data controller for the
          purposes of the NDPA is {DATA_CONTROLLER}.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          What we store
        </h2>
        <p>
          When you create an account we store your email address, your name, and
          the business details you provide. When you import a statement, the
          transactions parsed from it — dates, descriptions, amounts, and any
          category you assign — are stored so they can be shown back to you in
          your dashboard, reports, and exports.
        </p>
        <p>
          We also keep ordinary security and operations records: a record of
          when you accepted these terms, sign-in and rate-limiting metadata, and
          scrubbed error diagnostics (see &ldquo;Error monitoring&rdquo; below).
          We do not collect advertising identifiers, and we do not sell or rent
          personal data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Why we process it (lawful bases)
        </h2>
        <p>
          We process personal data to perform the service you asked for
          (providing your account, importing and showing your transactions, and
          producing your reports), to keep the service secure and prevent abuse,
          and to meet our own legal obligations. Where we rely on your consent —
          for example, an optional feature or product email — you can withdraw
          that consent at any time without affecting your use of the core
          service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          How your data is stored and isolated
        </h2>
        <p>
          Data is stored in Supabase (a hosted Postgres database). Every record
          is tied to your account, and access is enforced twice: the application
          layer only ever queries records scoped to your signed-in business, and
          Supabase row-level security (RLS) policies independently restrict each
          row to its owner at the database level. Your data is never shared with
          or visible to other users.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Who we share it with
        </h2>
        <p>
          We share personal data only with the processors that run the service
          on our behalf, under contract and only for the purposes below:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {SUB_PROCESSORS.map((processor) => (
            <li key={processor.name}>
              <span className="font-medium text-foreground">
                {processor.name}
              </span>{" "}
              — {processor.purpose}.
            </li>
          ))}
        </ul>
        <p>
          We do not sell personal data and we do not disclose it to anyone else
          unless the law requires it.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Error monitoring
        </h2>
        <p>
          We use Sentry to catch and diagnose crashes. Before an error is sent,
          it is scrubbed of your identity and of request contents: your name and
          email, request bodies, cookies, authentication headers, and query
          strings are removed, so monitoring never carries your financial rows.
          Error monitoring is disabled entirely unless it is configured, and it
          is never used for advertising or profiling.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Where your data is held
        </h2>
        <p>
          Our processors host data in secure data centres, which may be outside
          Nigeria. Where personal data is transferred out of Nigeria, we rely on
          appropriate safeguards consistent with the NDPA and only transfer to
          processors that provide an adequate level of protection.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          How long we keep it
        </h2>
        <p>
          We keep your account and the data associated with it for as long as
          your account exists. When you delete your account, your profile,
          businesses, accounts, categories, imports and transactions are removed
          from the active database. Short-lived security records (such as rate
          limits) expire automatically, and limited backups may persist for the
          backup retention window before they age out.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Your rights
        </h2>
        <p>Under the NDPA you have the right to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>access the personal data we hold about you and obtain a copy;</li>
          <li>ask us to correct anything that is inaccurate or incomplete;</li>
          <li>ask us to delete your personal data (the right to erasure);</li>
          <li>restrict or object to certain processing;</li>
          <li>receive your data in a portable, machine-readable format; and</li>
          <li>withdraw any consent you have given.</li>
        </ul>
        <p>
          You can exercise two of these yourself at any time, without contacting
          us: open{" "}
          <span className="font-medium text-foreground">Settings → Account</span>{" "}
          to export everything we hold for you as CSV or JSON, or to permanently
          delete your account and all of its data.
        </p>
        <p>
          For everything else — correcting anything that is inaccurate or
          incomplete, restricting or objecting to processing, or withdrawing
          consent — email{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-brand hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          . We will respond within the timeframes the NDPA requires.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          How to request deletion
        </h2>
        <p>
          You can delete your account and all associated data yourself at any
          time from{" "}
          <span className="font-medium text-foreground">Settings → Account</span>
          . Deletion removes your profile, businesses, accounts, categories,
          imports and transactions, and removes your authentication record. If
          you would rather we did it for you, email{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-brand hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          and we will action the request.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          How we protect it
        </h2>
        <p>
          Connections are encrypted in transit with HTTPS. Passwords are handled
          by Supabase Auth and are never stored by the application in plain text.
          Two-factor authentication is available on every account, and sessions
          can be revoked across all devices. Access to production data is limited
          and tenant-scoped at both the application and database layers.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Children</h2>
        <p>
          LedgerAI is a business tool and is not directed at children. It is not
          intended for use by anyone under 18, and we do not knowingly collect
          their personal data.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Cookies</h2>
        <p>
          LedgerAI uses a single, strictly-necessary session cookie to keep you
          signed in. It is marked HTTP-only and is not used for advertising or
          third-party tracking. Because we set no analytics or advertising
          cookies, there is no cookie-consent banner to dismiss.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Complaints
        </h2>
        <p>
          If you are unhappy with how we have handled your personal data, please
          contact us first at{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-brand hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{" "}
          so we can put it right. You also have the right to lodge a complaint
          with the {NDPC_NAME} at{" "}
          <a
            href={`${NDPC_URL}`}
            className="font-medium text-brand hover:underline"
            rel="noreferrer"
            target="_blank"
          >
            {NDPC_URL.replace(/^https?:\/\//, "")}
          </a>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Changes to this notice
        </h2>
        <p>
          We may update this notice as the service changes. When we make a
          material change we will update the date at the top of this page, and
          where the law requires it we will ask you to review and accept the
          updated notice.
        </p>
      </section>
    </LegalPage>
  );
}
