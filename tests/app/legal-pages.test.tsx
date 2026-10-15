import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";

const CONTACT = "ifeoluwaniolufunmilayo@gmail.com";

describe("privacy page", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);

  it("is explicit that this is a demo project", () => {
    expect(html).toContain("portfolio and demonstration project");
  });

  it("explains Supabase storage and per-user row-level isolation", () => {
    expect(html).toContain("Supabase");
    expect(html).toContain("row-level security");
    expect(html).toContain("RLS");
  });

  it("tells the visitor how to request deletion", () => {
    expect(html).toContain("delet");
    expect(html).toContain(CONTACT);
  });
});

describe("terms page", () => {
  const html = renderToStaticMarkup(<TermsPage />);

  it("frames the project as a demonstration, not a commercial service", () => {
    expect(html).toContain("portfolio and demonstration project");
  });

  it("states it is not financial or accounting advice", () => {
    expect(html).toContain("Not financial or accounting advice");
    expect(html).toContain("as is");
  });

  it("offers a contact route", () => {
    expect(html).toContain(CONTACT);
  });
});
