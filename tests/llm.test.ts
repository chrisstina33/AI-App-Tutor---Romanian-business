import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("OpenRouter tutor provider", () => {
  it("does not fall back to OpenAI or Forge when the OpenRouter key is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY_GPT5_MINI", "");
    vi.stubEnv("OPENAI_API_KEY_GPT5_MINI", "openai-fallback-key");
    vi.stubEnv("BUILT_IN_FORGE_API_KEY", "forge-fallback-key");

    const { invokeLLM } = await import("../server/_core/llm");

    await expect(
      invokeLLM({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: "Salut" }],
      }),
    ).rejects.toThrow("OpenRouter API key is missing");
  });

  it("sends tutor requests to OpenRouter with the configured model and key", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "openrouter-test-key");
    vi.stubEnv("OPENROUTER_API_KEY_GPT5_MINI", "");
    vi.stubEnv("OPENROUTER_MODEL_GPT5_MINI", "openai/gpt-5-mini");
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            id: "response-1",
            created: 1,
            model: "openai/gpt-5-mini",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "Răspuns live" },
                finish_reason: "stop",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { invokeLLM } = await import("../server/_core/llm");

    const response = await invokeLLM({
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "Salut" }],
    });

    expect(response.choices[0]?.message.content).toBe("Răspuns live");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer openrouter-test-key",
        }),
        body: expect.stringContaining('"model":"openai/gpt-5-mini"'),
      }),
    );
  });
});
