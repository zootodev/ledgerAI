import type { InsightKind } from "@/lib/finance/insights";

/** Serialized insight consumed by the UI (server DTO == client type). */
export interface InspectInsight {
  kind: InsightKind;
  title: string;
  description: string;
  /** Backing metrics so cards can show sourced figures. */
  metadata: Record<string, unknown>;
  /** Effective queried window; null bounds mean "all time" / open-ended. */
  period: { from: string | null; to: string | null };
}