import { createHmac, timingSafeEqual } from "node:crypto";

export interface ReviewUndoPayload {
  businessId: string;
  createdAt: number;
  changes: Array<{
    id: string;
    categoryId: string | null;
    aiConfidence: string | null;
  }>;
  rule: {
    pattern: string;
    prior: {
      id: string;
      categoryId: string | null;
      categoryName: string | null;
    } | null;
    createdId: string | null;
  } | null;
}

const TOKEN_TTL_MS = 10 * 60 * 1000;

function secret(): string {
  // The service-role key is server-only and already required by this app.
  return process.env.SUPABASE_SERVICE_ROLE_KEY ?? "ledgerai-review-undo-dev";
}

function sign(encoded: string): string {
  return createHmac("sha256", secret()).update(encoded).digest("base64url");
}

/** Server-issued opaque token; the payload is only meaningful with the secret. */
export function signUndoToken(payload: ReviewUndoPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

/** Verify signature + expiry and return the snapshot, or null if tampered/stale. */
export function verifyUndoToken(token: string | undefined | null): ReviewUndoPayload | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as ReviewUndoPayload;
    if (
      !payload.businessId ||
      !Array.isArray(payload.changes) ||
      typeof payload.createdAt !== "number" ||
      Date.now() - payload.createdAt > TOKEN_TTL_MS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
