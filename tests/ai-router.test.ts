import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  extractJsonFromText,
  getConfiguredProviders,
  runWithFailover,
} from "@/lib/ai/router";

describe("multi-provider AI router", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.AI_PROVIDER_ORDER = "anthropic,openai,gemini,openrouter";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.GEMINI_API_KEY = "AIza-test";
    process.env.GEMINI_MODEL = "gemini-3.1-pro-preview,gemini-flash-lite-latest";
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("skips unconfigured providers and preserves priority order", () => {
    const providers = getConfiguredProviders();
    expect(providers.map((p) => `${p.provider}:${p.model}`)).toEqual([
      "anthropic:claude-sonnet-4-5",
      "openai:gpt-4.1",
      "gemini:gemini-3.1-pro-preview",
      "gemini:gemini-flash-lite-latest",
    ]);
  });

  it("uses primary provider when healthy", async () => {
    const fetchMock: typeof fetch = async (input) => {
      expect(String(input)).toContain("api.anthropic.com");
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: '{"ok":true}' }],
        }),
        { status: 200 }
      );
    };

    const res = await runWithFailover({
      systemPrompt: "sys",
      userPrompt: "usr",
      fetchImpl: fetchMock,
    });

    expect(res.meta.provider).toBe("anthropic");
    expect(res.meta.fallbackUsed).toBe(false);
    expect(res.meta.attempts).toHaveLength(1);
  });

  it("fails over automatically when primary hits 429 and secondary hits 503", async () => {
    const calls: string[] = [];
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("anthropic.com")) {
        return new Response("rate limit exceeded", { status: 429 });
      }
      if (url.includes("openai.com")) {
        return new Response("upstream unavailable", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '```json\n{"verdict":"PASS"}\n```' }] } },
          ],
        }),
        { status: 200 }
      );
    };

    const res = await runWithFailover({
      systemPrompt: "sys",
      userPrompt: "usr",
      fetchImpl: fetchMock,
    });

    expect(calls).toHaveLength(3);
    expect(res.meta.provider).toBe("gemini");
    expect(res.meta.fallbackUsed).toBe(true);
    expect(res.meta.attempts.map((a) => [a.provider, a.success, a.statusCode])).toEqual([
      ["anthropic", false, 429],
      ["openai", false, 503],
      ["gemini", true, undefined],
    ]);

    const parsed = extractJsonFromText<{ verdict: string }>(res.text);
    expect(parsed.verdict).toBe("PASS");
  });

  it("cascades across models within Gemini and filters thought parts", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("gemini-3.1-pro-preview")) {
        return new Response("quota exceeded", { status: 429 });
      }
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  { text: "internal thinking...", thought: true },
                  { text: '{"ok":true}' },
                ],
              },
            },
          ],
        }),
        { status: 200 }
      );
    };

    const res = await runWithFailover({
      systemPrompt: "sys",
      userPrompt: "usr",
      fetchImpl: fetchMock,
    });

    expect(res.meta.provider).toBe("gemini");
    expect(res.meta.model).toBe("gemini-flash-lite-latest");
    expect(res.meta.fallbackUsed).toBe(true);
    expect(res.text).toBe('{"ok":true}');
  });
});

