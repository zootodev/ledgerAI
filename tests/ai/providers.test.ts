import { describe, expect, it, vi } from "vitest";
import {
  DeterministicInterpreter,
  DeterministicNarrationPlanner,
} from "@/lib/ai/providers/deterministic";
import {
  OpenAiCompatibleClient,
  OpenAiCompatibleInterpreter,
  OpenAiCompatibleNarrationPlanner,
} from "@/lib/ai/providers/openai-compatible";
import {
  getAskAi,
  readAskAiConfig,
  isAiProviderConfigured,
  type AskTurnMessages,
} from "@/lib/ai/ask-provider";

const MESSAGES: AskTurnMessages = {
  system: "You are a rubric. Never compute.",
  user: "How much did I spend?",
  promptVersion: "2026-08-v1",
};

describe("deterministic providers", () => {
  it("interpreter never fabricates meaning (unsupported, zero confidence)", async () => {
    const interpreter = new DeterministicInterpreter();
    expect(interpreter.configured).toBe(false);
    expect(interpreter.model).toBeNull();
    const outcome = await interpreter.interpret(MESSAGES, { signal: new AbortController().signal });
    expect(outcome).toMatchObject({ disposition: "unsupported", confidence: 0 });
  });

  it("narration planner yields the canonical default plan", async () => {
    const planner = new DeterministicNarrationPlanner();
    expect(planner.configured).toBe(false);
    const plan = await planner.plan(
      {
        system: "",
        manifest: {
          answerKind: "summary",
          facts: [
            { id: "F1", kind: "period", display: "August 2026", required: true },
            { id: "F2", kind: "money", display: "₦600,000", required: true },
          ],
          allowedTemplates: ["direct", "brief", "explain"],
        },
        promptVersion: "2026-08-v1",
      },
      { signal: new AbortController().signal },
    );
    expect(plan).toMatchObject({ template: "direct" });
    expect(Object.keys(plan as object)).toEqual(
      expect.arrayContaining(["template", "factOrder", "optionalLead"]),
    );
  });
});

describe("OpenAiCompatibleClient", () => {
  it("requires a configured model and key", () => {
    expect(
      () => new OpenAiCompatibleClient({ name: "x", baseUrl: "https://api.example.com/v1", apiKey: "k", model: "" }),
    ).toThrow(/AI_MODEL is required/);
    const client = new OpenAiCompatibleClient({
      name: "x",
      baseUrl: "https://api.example.com/v1",
      apiKey: "k",
      model: "gpt-4o-mini",
    });
    expect(client.credentialReady).toBe(true);
  });

  it("posts a hardened body and surfaces the parsed JSON content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"disposition":"unsupported"}' } }] }),
    });
    const client = new OpenAiCompatibleClient({
      name: "x",
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });

    const result = await client.complete([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ disposition: "unsupported" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.example.com/v1/chat/completions");
    const sent = JSON.parse(init.body);
    expect(sent.temperature).toBe(0);
    expect(sent.stream).toBe(false);
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(init.headers.authorization).toBe("Bearer secret");
  });

  it("retries exactly once on a 5xx and succeeds on the second attempt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ choices: [{ message: { content: '{"disposition":"clarify"}' } }] }),
      });
    const client = new OpenAiCompatibleClient({
      name: "x",
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });

    const result = await client.complete([{ role: "user", content: "hi" }], {
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ disposition: "clarify" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    // Replays with the SAME body.
    const firstBody = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const lastBody = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(firstBody).toEqual(lastBody);
  });

  it("returns null (never throws) when upstream sends empty content", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: null } }] }),
    });
    const client = new OpenAiCompatibleClient({
      name: "x",
      baseUrl: "https://api.example.com",
      apiKey: "secret",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });
    await expect(
      client.complete([{ role: "user", content: "hi" }], { signal: new AbortController().signal }),
    ).resolves.toBeNull();
  });
});

describe("OpenAiCompatible adatpers", () => {
  it("interpreter/planner are only configured when a key is present", () => {
    const noKey = new OpenAiCompatibleInterpreter("openai", {
      baseUrl: "https://api.example.com",
      apiKey: undefined,
      model: "gpt-4o-mini",
    });
    expect(noKey.configured).toBe(false);
    const withKey = new OpenAiCompatibleInterpreter("openai", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
      model: "gpt-4o-mini",
    });
    expect(withKey.configured).toBe(true);
    expect(withKey.model).toBe("gpt-4o-mini");
  });

  it("planner sends a redacted manifest (ids + display only)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"template":"direct","factOrder":["F1","F2"],"optionalLead":"none"}' } }] }),
    });
    const planner = new OpenAiCompatibleNarrationPlanner("openai", {
      baseUrl: "https://api.example.com",
      apiKey: "k",
      model: "gpt-4o-mini",
      fetchImpl: fetchImpl as never,
    });
    await planner.plan(
      {
        system: "",
        manifest: {
          answerKind: "summary",
          facts: [{ id: "F2", kind: "money", display: "₦600,000", required: true }],
          allowedTemplates: ["direct"],
        },
        promptVersion: "2026-08-v1",
      },
      { signal: new AbortController().signal },
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    // The user message is the manifest as structured fact ids — never raw data.
    expect(JSON.stringify(body.messages[1].content)).not.toMatch(/transaction/i);
  });
});

describe("getAskAi selector (server env)", () => {
  it("defaults to deterministic providers in off mode without keys", () => {
    const runtime = getAskAi({} as NodeJS.ProcessEnv);
    expect(runtime.config.mode).toBe("off");
    expect(runtime.providers.interpreter.configured).toBe(false);
    expect(runtime.providers.narrationPlanner.configured).toBe(false);
  });

  it("wires an OpenAI-compatible interpreter when a provider + key are set", () => {
    const runtime = getAskAi({
      ASK_LLM_MODE: "canary",
      ASK_LLM_INTERPRETER_ENABLED: "1",
      AI_PROVIDER: "openai",
      AI_API_KEY: "k",
      AI_MODEL: "gpt-4o-mini",
      AI_BASE_URL: "https://api.example.com/v1",
    } as unknown as NodeJS.ProcessEnv);
    expect(runtime.config.mode).toBe("canary");
    expect(runtime.providers.interpreter.name).toBe("openai");
    expect(runtime.providers.interpreter.configured).toBe(true);
    // Narration stays deterministic off unless ASK_LLM_NARRATION_ENABLED.
    expect(runtime.providers.narrationPlanner.configured).toBe(false);
  });

  it("enables narration only when ASK_LLM_NARRATION_ENABLED is on", () => {
    const runtime = getAskAi({
      ASK_LLM_MODE: "canary",
      ASK_LLM_NARRATION_ENABLED: "1",
      AI_PROVIDER: "openai",
      AI_API_KEY: "k",
      AI_MODEL: "gpt-4o-mini",
    } as unknown as NodeJS.ProcessEnv);
    expect(runtime.providers.narrationPlanner.configured).toBe(true);
  });

  it("ignores the 'rules' provider and clamps the shadow sample rate", () => {
    expect(isAiProviderConfigured({ AI_PROVIDER: "rules" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    const config = readAskAiConfig({
      ASK_LLM_MODE: "shadow",
      ASK_SHADOW_SAMPLE_RATE: "2.5",
    } as unknown as NodeJS.ProcessEnv);
    expect(config.mode).toBe("shadow");
    expect(config.shadowSampleRate).toBe(1);
  });

  it("parses ASK_V2_ENABLED with a safe default OFF, independent of mode", () => {
    expect(readAskAiConfig({} as NodeJS.ProcessEnv).askV2Enabled).toBe(false);
    expect(
      readAskAiConfig({ ASK_V2_ENABLED: "true", ASK_LLM_MODE: "off" } as unknown as NodeJS.ProcessEnv)
        .askV2Enabled,
    ).toBe(true);
    expect(
      readAskAiConfig({ ASK_V2_ENABLED: "false", ASK_LLM_MODE: "canary" } as unknown as NodeJS.ProcessEnv)
        .askV2Enabled,
    ).toBe(false);
  });
});