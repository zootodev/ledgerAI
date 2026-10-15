import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using LedgerAI, a portfolio and demonstration project.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="15 October 2026">
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          A demonstration project
        </h2>
        <p>
          LedgerAI is a portfolio and demonstration project provided for
          evaluation and learning. It is not a commercial product, and no
          service level, availability, or support commitment is offered.
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
          Your responsibilities
        </h2>
        <p>
          You are responsible for the data you upload and for keeping your
          account credentials secure. Please only upload data you are entitled
          to use, and avoid uploading anything you would not want processed by a
          demonstration service.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">
          No warranty
        </h2>
        <p>
          LedgerAI is provided &ldquo;as is&rdquo;, without warranties of any
          kind. To the fullest extent permitted by law, the project author is
          not liable for any loss or damage arising from use of the project.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Contact</h2>
        <p>
          Questions about these terms can be sent to{" "}
          <a
            href="mailto:ifeoluwaniolufunmilayo@gmail.com"
            className="font-medium text-brand hover:underline"
          >
            ifeoluwaniolufunmilayo@gmail.com
          </a>
          .
        </p>
      </section>
    </LegalPage>
  );
}
