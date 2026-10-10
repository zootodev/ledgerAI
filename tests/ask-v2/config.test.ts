import { describe, expect, it } from "vitest";
import { isAskV2Enabled } from "@/lib/ask-v2/config";
import { isAskEnabled } from "@/lib/ask/config";
import { readAskAiConfig } from "@/lib/ai/ask-provider";

describe("ASK_V2_ENABLED gate", () => {
  it("defaults to disabled when the variable is absent (safe default OFF)", () => {
    expect(isAskV2Enabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAskV2Enabled({ ASK_V2_ENABLED: "" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("enables on the canonical truthy forms", () => {
    for (const v of ["1", "true", "yes", "on"]) {
      expect(isAskV2Enabled({ ASK_V2_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it("disables on falsy forms and an explicit false", () => {
    for (const v of ["0", "false", "no", "off"]) {
      expect(isAskV2Enabled({ ASK_V2_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("is independent of ASK_LLM_MODE (canary does NOT arm v2)", () => {
    expect(
      isAskV2Enabled({ ASK_LLM_MODE: "canary" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isAskV2Enabled({
        ASK_V2_ENABLED: "true",
        ASK_LLM_MODE: "off",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("is independent of the other v1 AI-mode flags", () => {
    const config = readAskAiConfig({
      ASK_V2_ENABLED: "true",
      ASK_LLM_MODE: "canary",
      ASK_LLM_INTERPRETER_ENABLED: "1",
      ASK_LLM_NARRATION_ENABLED: "1",
      ASK_SHADOW_SAMPLE_RATE: "1",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.askV2Enabled).toBe(true);

    const disabled = readAskAiConfig({
      ASK_V2_ENABLED: "false",
      ASK_LLM_INTERPRETER_ENABLED: "1",
      ASK_LLM_NARRATION_ENABLED: "1",
    } as unknown as NodeJS.ProcessEnv);
    expect(disabled.askV2Enabled).toBe(false);
  });
});

describe("ASK_ENABLED gate (v1 /ask on hold)", () => {
  it("defaults to disabled when the variable is absent (safe default OFF)", () => {
    expect(isAskEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isAskEnabled({ ASK_ENABLED: "" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });

  it("enables on the canonical truthy forms", () => {
    for (const v of ["1", "true", "yes", "on"]) {
      expect(isAskEnabled({ ASK_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(true);
    }
  });

  it("disables on falsy forms and an explicit false", () => {
    for (const v of ["0", "false", "no", "off"]) {
      expect(isAskEnabled({ ASK_ENABLED: v } as unknown as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it("is independent of ASK_V2_ENABLED and ASK_LLM_MODE", () => {
    expect(
      isAskEnabled({ ASK_V2_ENABLED: "true" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isAskEnabled({ ASK_LLM_MODE: "canary" } as unknown as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isAskEnabled({
        ASK_ENABLED: "true",
        ASK_V2_ENABLED: "off",
      } as unknown as NodeJS.ProcessEnv),
    ).toBe(true);

    const config = readAskAiConfig({
      ASK_ENABLED: "true",
      ASK_V2_ENABLED: "true",
      ASK_LLM_MODE: "canary",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.askEnabled).toBe(true);
    expect(config.askV2Enabled).toBe(true);
  });
});