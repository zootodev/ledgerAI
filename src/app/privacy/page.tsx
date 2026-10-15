import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How LedgerAI stores your statement data, how it is isolated per user, and how to request deletion.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="15 October 2026">
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
          How to request deletion
        </h2>
        <p>
          You can request that your account and all associated data be deleted
          by emailing{" "}
          <a
            href="mailto:ifeoluwaniolufunmilayo@gmail.com"
            className="font-medium text-brand hover:underline"
          >
            ifeoluwaniolufunmilayo@gmail.com
          </a>
          . Because this is a demo project, deletion is handled manually; your
          account and its transactions will be removed on request.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Cookies</h2>
        <p>
          LedgerAI uses a single session cookie to keep you signed in. It is
          marked HTTP-only and is not used for advertising or third-party
          tracking.
        </p>
      </section>
    </LegalPage>
  );
}
