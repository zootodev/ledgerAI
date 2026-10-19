/**
 * Single source of truth for the legal documents (Nigeria Data Protection Act
 * 2023 — the "NDPA" — and its NDPR subsidiary regulation).
 *
 * The privacy notice and terms pages import these values, and the signup
 * consent records the exact versions a user accepted, so a recorded consent can
 * always be traced back to the text that was live at the time.
 */

/** Data controller identity (the entity that determines why/how data is used). */
export const DATA_CONTROLLER = "LedgerAI";

/** Address for privacy/legal enquiries and data-subject requests. */
export const LEGAL_CONTACT_EMAIL = "ifeoluwaniolufunmilayo@gmail.com";

/** Where a data subject may lodge a complaint with the regulator. */
export const NDPC_NAME = "Nigeria Data Protection Commission";
export const NDPC_URL = "https://ndpc.gov.ng";

/** Human-readable "last updated" date shown under each document's title. */
export const LEGAL_UPDATED = "17 October 2026";

/**
 * Machine version stamps recorded with a user's acceptance at signup. Bump
 * these (ISO date of the change) whenever the corresponding text changes
 * materially, so existing consents are not mis-attributed to newer text.
 */
export const TERMS_VERSION = "2026-10-17";
export const PRIVACY_VERSION = "2026-10-17";

/** Routes serving the legal documents (linked from the app shell footer). */
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";

/** Third-party processors that may handle data on the controller's behalf. */
export const SUB_PROCESSORS = [
  { name: "Supabase", purpose: "Postgres database, authentication and file storage" },
  { name: "Vercel", purpose: "Application hosting and edge delivery" },
  { name: "Sentry", purpose: "Error monitoring (receives scrubbed, non-personal diagnostics only)" },
] as const;
