import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED,
  NDPC_URL,
} from "@/lib/legal/constants";

const CONTACT = LEGAL_CONTACT_EMAIL;
/** Strip tags so assertions read as visible copy. */
function visible(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

describe("privacy page", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  const copy = visible(html);

  it("is explicit that this is a demo project", () => {
    expect(html).toContain("portfolio and demonstration project");
  });

  it("explains Supabase storage and per-user row-level isolation", () => {
    expect(html).toContain("Supabase");
    expect(html).toContain("row-level security");
    expect(html).toContain("RLS");
  });

  it("names the Nigeria Data Protection Act and its regulator", () => {
    expect(copy).toContain("Nigeria Data Protection Act 2023");
    expect(copy).toContain("Nigeria Data Protection Commission");
    expect(html).toContain(NDPC_URL);
  });

  it("sets out lawful bases and the data-subject rights", () => {
    for (const phrase of [
      "lawful bases",
      "access",
      "correct",
      "delete",
      "restrict or object",
      "portable",
      "withdraw any consent",
    ]) {
      expect(copy.toLowerCase()).toContain(phrase);
    }
  });

  it("discloses processors, retention, transfers and security", () => {
    for (const phrase of [
      "Sentry",
      "Vercel",
      "How long we keep it",
      "outside",
      "Nigeria",
      "HTTPS",
      "Two-factor",
    ]) {
      expect(copy).toContain(phrase);
    }
  });

  it("points to self-service export and deletion as well as the contact route", () => {
    expect(copy).toContain("Settings → Account");
    expect(copy).toContain("export");
    expect(copy.toLowerCase()).toContain("delet");
    expect(html).toContain(CONTACT);
  });
});

describe("terms page", () => {
  const html = renderToStaticMarkup(<TermsPage />);
  const copy = visible(html);

  it("frames the project as a demonstration, not a commercial service", () => {
    expect(html).toContain("portfolio and demonstration project");
  });

  it("states it is not financial or accounting advice", () => {
    expect(html).toContain("Not financial or accounting advice");
    expect(html).toContain("as is");
  });

  it("sets out eligibility, acceptable use and termination", () => {
    for (const phrase of [
      "at least 18 years old",
      "acceptable use",
      "Termination",
    ]) {
      expect(copy).toContain(phrase);
    }
  });

  it("is governed by Nigerian law", () => {
    expect(copy).toContain("Federal Republic of Nigeria");
    expect(copy).toContain("Nigerian courts");
  });

  it("offers a contact route", () => {
    expect(html).toContain(CONTACT);
  });
});

describe("legal documents share one version source", () => {
  it("shows the shared last-updated date on both pages", () => {
    for (const html of [
      renderToStaticMarkup(<PrivacyPage />),
      renderToStaticMarkup(<TermsPage />),
    ]) {
      expect(html).toContain("Last updated");
      expect(html).toContain(LEGAL_UPDATED);
    }
  });
});
