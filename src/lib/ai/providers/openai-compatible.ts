// ============================================================
// LedgerAI — OpenAI-compatible ask provider (Stage 3/4)
// ------------------------------------------------------------
// A zero-SDK structured-output client over any OpenAI-compatible
// `/chat/completions` endpoint (OpenAI, OpenRouter, etc.). Used ONLY
// for the interpreter and the fact-ID narration planner. It holds no
// database handles and never receives tenant ids, transactions, or
// financial values — just the redacted surface from the resolver.
//
// Hardening (spec §7): temperature 0, pinned model, bounded output
// tokens, abort deadline, ONE transport retry under the same
// trace/idempotency key, JSON-object mode. Any failure surfaces as a
// thrown error (or null content) which the service converts to the
// deterministic fallback.
// ============================================================

import {
  type AskInterpreterProvider,
  type AskProviderOptions,
  type AskTurnMessages,
  type NarrationPlannerProvider,
  type NarrationPlannerInput,
} from "@/lib/ai/ask-provider";

export interface OpenAiCompatibleOptions {
  name: string;
  baseUrl: string;
  apiKey: string | undefined;
  model: string | undefined;
  /** Injectable for tests; defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Max completion tokens (provider output is bounded anyway). */
  maxTokens?: number;
  /** Abort deadline for one attempt. */
  deadlineMs?: number;
  /** Logical role of this client for redacted diagnostics only. */
  operation?: string;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
  error?: { message?: string };
}

/**
 * Executor for one chat request with aborts + a single idempotent retry.
 * The API key is never logged; the payload is never logged.
 */
export class OpenAiCompatibleClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly modelName: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxTokens: number;
  private readonly deadlineMs: number;
  private readonly operation: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    const model = options.model?.trim();
    if (!model || model.length === 0) {
      throw new Error("openai-compatible: AI_MODEL is required when a provider is configured.");
    }
    this.modelName = model;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.maxTokens = options.maxTokens ?? 600;
    this.deadlineMs = options.deadlineMs ?? 12_000;
    this.operation = options.operation ?? "chat";
  }

  /**
   * Redacted, ASK_DEBUG=1-only diagnostic line. Never logs the API key,
   * Authorization header, request/response bodies, or prompts.
   */
  private debug(
    category: "http" | "transport" | "malformed_json" | "timeout",
    attempt: number,
    startedAt: number,
    extra: Record<string, string | number | null> = {},
  ): void {
    if (process.env.ASK_DEBUG !== "1") return;
    console.error(
      "[ask-provider] " +
        JSON.stringify({
          category,
          provider: "openai-compatible",
          operation: this.operation,
          model: this.modelName,
          attempt,
          elapsedMs: Math.round(performance.now() - startedAt),
          ...extra,
        }),
    );
  }

  /** True when we have a usable key (missing key => provider stays off). */
  get credentialReady(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 0);
  }

  /** Deployment-pinned model id (metadata only; never secrets). */
  get model(): string {
    return this.modelName;
  }

  async complete(
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
    options: AskProviderOptions,
  ): Promise<unknown> {
    if (!this.credentialReady) {
      throw new Error("openai-compatible: AI_API_KEY is not configured for this provider.");
    }

    const body = {
      model: this.modelName,
      messages,
      temperature: 0,
      max_tokens: this.maxTokens,
      response_format: { type: "json_object" },
      stream: false,
    };

    let attempt = 0;
    const startedAt = performance.now();
    // One transport retry, always with the SAME body/purpose (spec §8).
    while (attempt < 2) {
      attempt += 1;
      try {
        const response = await this.fetchImpl(this.url(), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
          signal: deadlineAbortSignal(options.signal, this.deadlineMs),
        });

        if (response.status === 429 || response.status >= 500) {
          if (attempt < 2) {
            await sleep(150);
            continue;
          }
          this.debug("http", attempt, startedAt, {
            status: response.status,
            statusText: response.statusText,
          });
          throw new Error(`openai-compatible: upstream ${response.status}`);
        }
        if (!response.ok) {
          this.debug("http", attempt, startedAt, {
            status: response.status,
            statusText: response.statusText,
          });
          throw new Error(`openai-compatible: upstream ${response.status}`);
        }

        const parsed = (await response.json()) as ChatCompletionResponse;
        const content = parsed.choices?.[0]?.message?.content;
        if (content === undefined || content === null || content.trim().length === 0) {
          return null;
        }
        return JSON.parse(content) as unknown;
      } catch (error) {
        const errorName = error instanceof Error ? error.name : "unknown";
        if (errorName === "AbortError") {
          this.debug("timeout", attempt, startedAt, { errorName }); // rethrown; typed upstream
          throw error;
        }
        if (isRetryableTransportError(error) && attempt < 2) {
          await sleep(150);
          continue;
        }
        this.debug(
          errorName === "SyntaxError" ? "malformed_json" : "transport",
          attempt,
          startedAt,
          {
            errorName,
            errorMessage:
              error instanceof Error
                ? error.message.slice(0, 300)
                : String(error).slice(0, 300),
          },
        );
        throw error;
      }
    }
    return null; // unreachable; defensive
  }

  private url(): string {
    return `${this.baseUrl}/chat/completions`;
  }
}

/** Combines the caller's abort with a hard deadline. */
export function deadlineAbortSignal(caller: AbortSignal, ms: number): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([caller, AbortSignal.timeout(ms)]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  caller.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), ms);
  // Best-effort cleanup (Node >= 20 ignores a settled listener).
  if (typeof timer.unref === "function") timer.unref();
  const original = function () {
    caller.removeEventListener("abort", onAbort);
    clearTimeout(timer);
  };
  (controller.signal as AbortSignal).addEventListener?.("abort", original, { once: true });
  return controller.signal;
}

function isRetryableTransportError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|timeout/i.test(error.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Interpreter adapter over an OpenAI-compatible endpoint. */
export class OpenAiCompatibleInterpreter implements AskInterpreterProvider {
  readonly name: string;
  private readonly client: OpenAiCompatibleClient;

  constructor(name: string, options: Omit<OpenAiCompatibleOptions, "name">) {
    this.name = name;
    this.client = new OpenAiCompatibleClient({ ...options, name, operation: "interpreter" });
  }

  // A key is what makes a provider "configured" (model presence checked at
  // construction). Without a key the provider is inert and the deterministic
  // path wins — matching "Provider disabled/no key => deterministic path".
  get configured(): boolean {
    return this.client.credentialReady;
  }

  /** Exposes the deployment-pinned model as metadata (never a secret). */
  get model(): string {
    return this.client.model;
  }

  async interpret(input: AskTurnMessages, options: AskProviderOptions): Promise<unknown> {
    const result = await this.client.complete(
      [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      options,
    );
    // JSON.parse already returned a JSON object; fall back to null on nom-JSON.
    return result === null ? null : result;
  }
}

/** Narration planner adapter over the same OpenAI-compatible endpoint. */
export class OpenAiCompatibleNarrationPlanner implements NarrationPlannerProvider {
  readonly name: string;
  private readonly client: OpenAiCompatibleClient;

  constructor(name: string, options: Omit<OpenAiCompatibleOptions, "name">) {
    this.name = name;
    this.client = new OpenAiCompatibleClient({ ...options, name, operation: "narrator" });
  }

  get configured(): boolean {
    return this.client.credentialReady;
  }

  async plan(input: NarrationPlannerInput, options: AskProviderOptions): Promise<unknown> {
    return this.client.complete(
      [
        { role: "system", content: input.system },
        { role: "user", content: JSON.stringify({ manifest: input.manifest }) },
      ],
      options,
    );
  }
}