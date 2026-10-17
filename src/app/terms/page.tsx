import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import {
  DATA_CONTROLLER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
} from "@/lib/legal/constants";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using LedgerAI, a portfolio and demonstration project, governed by the laws of the Federal Republic of Nigeria.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated={LEGAL_UPDATED}>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          A demonstration project
        </h2>
        <p>
          LedgerAI is a portfolio and demonstration project provided for
          evaluation and learning. It is not a commercial product, and no
          service level, availability, or support commitment is offered. These
          terms are an agreement between you and {DATA_CONTROLLER}, and they
          govern your use of the service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Eligibility and your account
        </h2>
        <p>
          You must be at least 18 years old and able to enter into a binding
          agreement to use LedgerAI. You are responsible for keeping your
          account credentials secure, for everything done through your account,
          and for telling us promptly if you believe your account has been
          compromised. We recommend turning on two-factor authentication in
          Settings → Security.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Not financial or accounting advice
        </h2>
        <p>
          The figures, reports, and insights LedgerAI produces are derived from
          the statements and transactions you provide. They are intended to
          guide your understanding, not to substitute for professional
          accounting, tax, or financial advice. Always verify important numbers
          against your own records.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Your responsibilities and acceptable use
        </h2>
        <p>
          You are responsible for the data you upload and for keeping your
          account credentials secure. Please only upload data you are entitled
          to use, and avoid uploading anything you would not want processed by a
          demonstration service.
        </p>
        <p>
          You agree not to misuse the service — including by attempting to gain
          unauthorised access to other users&rsquo; data or to the systems that
          run the service, by probing or disrupting the service, or by uploading
          unlawful content.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Your data and intellectual property
        </h2>
        <p>
          The data you upload remains yours. We process it only as described in
          the Privacy Notice, which explains the rights you have under the
          Nigeria Data Protection Act 2023. The LedgerAI name, design and
          software remain the property of the project author.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Availability and changes
        </h2>
        <p>
          The service is offered as-is and may change, be interrupted, or be
          withdrawn without notice. We may update these terms; when we make a
          material change we will update the date at the top of this page, and
          where the law requires it we will ask you to review and accept the
          updated terms.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Termination and deletion
        </h2>
        <p>
          You can stop using the service and delete your account at any time
          from Settings → Account. We may suspend or end access where these
          terms are breached or where we are required to by law. On deletion,
          your data is removed as described in the Privacy Notice.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">No warranty</h2>
        <p>
          LedgerAI is provided &ldquo;as is&rdquo;, without warranties of any
          kind. To the fullest extent permitted by law, the project author is
          not liable for any loss or damage arising from use of the project.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          Governing law
        </h2>
        <p>
          These terms are governed by the laws of the Federal Republic of
          Nigeria, and any dispute arising out of or in connection with them is
          subject to the exclusive jurisdiction of the Nigerian courts.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-brand hover:underline"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
