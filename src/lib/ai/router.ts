import type { LLMAttempt, LLMMetadata } from "@/lib/types";

export type AIProviderName = "anthropic" | "openai" | "gemini" | "openrouter";

export interface RouterCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface RouterCompletionResult {
  text: string;
  meta: LLMMetadata;
}

interface ProviderConfig {
  provider: AIProviderName;
  apiKey: string;
  model: string;
}

const DEFAULT_ORDER: AIProviderName[] = [
  "anthropic",
  "openai",
  "gemini",
  "openrouter",
];

const DEFAULT_MODELS: Record<AIProviderName, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1",
  gemini: "gemini-3.1-pro-preview,gemini-flash-latest,gemini-flash-lite-latest",
  openrouter: "anthropic/claude-sonnet-4.5",
};

function parseModelList(raw: string | undefined, fallback: string): string[] {
  const source = raw?.trim() ? raw : fallback;
  return source
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function parseProviderOrder(raw?: string): AIProviderName[] {
  if (!raw) return DEFAULT_ORDER;
  const valid = new Set<AIProviderName>(DEFAULT_ORDER);
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase() as AIProviderName)
    .filter((s) => valid.has(s));
  return parsed.length > 0 ? parsed : DEFAULT_ORDER;
}

export function getConfiguredProviders(): ProviderConfig[] {
  const order = parseProviderOrder(process.env.AI_PROVIDER_ORDER);
  const keyMap: Record<AIProviderName, { key?: string; rawModels?: string }> = {
    anthropic: {
      key: process.env.ANTHROPIC_API_KEY?.trim(),
      rawModels: process.env.ANTHROPIC_MODEL,
    },
    openai: {
      key: process.env.OPENAI_API_KEY?.trim(),
      rawModels: process.env.OPENAI_MODEL,
    },
    gemini: {
      key: process.env.GEMINI_API_KEY?.trim(),
      rawModels: process.env.GEMINI_MODEL,
    },
    openrouter: {
      key: process.env.OPENROUTER_API_KEY?.trim(),
      rawModels: process.env.OPENROUTER_MODEL,
    },
  };

  const configs: ProviderConfig[] = [];
  for (const provider of order) {
    const entry = keyMap[provider];
    if (!entry.key) continue;
    const models = parseModelList(entry.rawModels, DEFAULT_MODELS[provider]);
    for (const model of models) {
      configs.push({ provider, apiKey: entry.key, model });
    }
  }
  return configs;
}

export function getPublicProviderSummary(): Array<{
  provider: AIProviderName;
  model: string;
  configured: boolean;
}> {
  const order = parseProviderOrder(process.env.AI_PROVIDER_ORDER);
  const configuredMap = new Map<AIProviderName, string[]>();
  for (const c of getConfiguredProviders()) {
    const list = configuredMap.get(c.provider) ?? [];
    list.push(c.model);
    configuredMap.set(c.provider, list);
  }
  const rawModels: Record<AIProviderName, string | undefined> = {
    anthropic: process.env.ANTHROPIC_MODEL,
    openai: process.env.OPENAI_MODEL,
    gemini: process.env.GEMINI_MODEL,
    openrouter: process.env.OPENROUTER_MODEL,
  };

  return order.map((provider) => {
    const models = configuredMap.get(provider);
    return {
      provider,
      model: models
        ? models.join(" → ")
        : parseModelList(rawModels[provider], DEFAULT_MODELS[provider]).join(
            " → "
          ),
      configured: Boolean(models && models.length > 0),
    };
  });
}

class ProviderHttpError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function callSingleProvider(
  cfg: ProviderConfig,
  req: RouterCompletionRequest
): Promise<string> {
  const fetchFn = req.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    req.timeoutMs ?? 15_000
  );

  try {
    if (cfg.provider === "anthropic") {
      const res = await fetchFn("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: req.maxTokens ?? 1400,
          temperature: req.temperature ?? 0.2,
          system: req.systemPrompt,
          messages: [{ role: "user", content: req.userPrompt }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderHttpError(
          `Anthropic HTTP ${res.status}: ${body.slice(0, 200)}`,
          res.status
        );
      }
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text =
        data.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
      if (!text) throw new ProviderHttpError("Empty Anthropic response", 502);
      return text;
    }

    if (cfg.provider === "openai" || cfg.provider === "openrouter") {
      const url =
        cfg.provider === "openai"
          ? "https://api.openai.com/v1/chat/completions"
          : "https://openrouter.ai/api/v1/chat/completions";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      };
      if (cfg.provider === "openrouter") {
        headers["HTTP-Referer"] = "https://agentescrow.local";
        headers["X-Title"] = "AgentEscrow";
      }
      const res = await fetchFn(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: cfg.model,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? 1400,
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new ProviderHttpError(
          `${cfg.provider} HTTP ${res.status}: ${body.slice(0, 200)}`,
          res.status
        );
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) {
        throw new ProviderHttpError(`Empty ${cfg.provider} response`, 502);
      }
      return text;
    }

    // Google Gemini REST API (key passed via header to avoid secret in URL)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      cfg.model
    )}:generateContent`;
    const res = await fetchFn(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: req.systemPrompt }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: req.userPrompt }],
          },
        ],
        generationConfig: {
          temperature: req.temperature ?? 0.2,
          maxOutputTokens: req.maxTokens ?? 1400,
        },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ProviderHttpError(
        `Gemini HTTP ${res.status}: ${body.slice(0, 200)}`,
        res.status
      );
    }
    const data = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      }>;
    };
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) throw new ProviderHttpError("Empty Gemini response", 502);
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

export async function runWithFailover(
  req: RouterCompletionRequest
): Promise<RouterCompletionResult> {
  const providers = getConfiguredProviders();
  if (providers.length === 0) {
    throw new Error(
      "No AI provider API keys configured. Set at least one of ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY."
    );
  }

  const attempts: LLMAttempt[] = [];
  const startAll = Date.now();

  for (let i = 0; i < providers.length; i++) {
    const cfg = providers[i];
    const start = Date.now();
    try {
      const text = await callSingleProvider(cfg, req);
      const latencyMs = Date.now() - start;
      attempts.push({
        provider: cfg.provider,
        model: cfg.model,
        success: true,
        latencyMs,
      });
      return {
        text,
        meta: {
          provider: cfg.provider,
          model: cfg.model,
          fallbackUsed: i > 0,
          latencyMs: Date.now() - startAll,
          attempts,
        },
      };
    } catch (err: unknown) {
      const latencyMs = Date.now() - start;
      const statusCode =
        err instanceof ProviderHttpError ? err.statusCode : undefined;
      const message =
        err instanceof Error ? err.message : "Unknown provider error";
      attempts.push({
        provider: cfg.provider,
        model: cfg.model,
        success: false,
        statusCode,
        error: message.slice(0, 240),
        latencyMs,
      });
    }
  }

  const summary = attempts
    .map((a) => `${a.provider}/${a.model}(${a.statusCode ?? "err"}): ${a.error}`)
    .join(" | ");
  throw new Error(`All configured AI providers failed: ${summary}`);
}

export function extractJsonFromText<T>(raw: string): T {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
    }
    throw new Error("AI response did not contain valid JSON");
  }
}
