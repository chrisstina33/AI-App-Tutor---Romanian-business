import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeTutorWithFallback, isImageGenerationRequest, modelFor, tutorChatInputSchema } from "../server/ai";
import { revealSlowly } from "../services/ai-service";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("tutor reply reveal", () => {
  it("reveals replies character by character at a slower pace", async () => {
    vi.useFakeTimers();
    const updates: string[] = [];
    const reveal = revealSlowly("Bun.", (partial) => updates.push(partial));

    expect(updates).toEqual(["B"]);
    await vi.advanceTimersByTimeAsync(54);
    expect(updates).toEqual(["B"]);
    await vi.advanceTimersByTimeAsync(1);
    expect(updates).toEqual(["B", "Bu"]);
    await vi.runAllTimersAsync();
    await reveal;

    expect(updates.at(-1)).toBe("Bun.");
  });
});

describe("tutor chat input", () => {
  const baseInput = {
    subject: "Matematică",
    mode: "guided" as const,
    question: "Ajută-mă cu tema atașată.",
    messages: [],
  };

  it("accepts assistant history up to the response limit", () => {
    const result = tutorChatInputSchema.safeParse({
      ...baseInput,
      messages: [{ role: "assistant", text: "Răspuns ".repeat(1000) }],
    });

    expect(result.success).toBe(true);
  });

  it("keeps the user-history limit aligned with the question limit", () => {
    const result = tutorChatInputSchema.safeParse({
      ...baseInput,
      messages: [{ role: "user", text: "x".repeat(4001) }],
    });

    expect(result.success).toBe(false);
  });

  it("routes explicit visual requests to high complexity and simple questions to low", () => {
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Desenează un paralelogram." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "direct", subject: "Biologie", question: "Generează o imagine a unei celule vegetale." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "direct", subject: "Biologie", question: "Analizează fotografia temei atașate." }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
    expect(modelFor({ mode: "concept", subject: "Biologie", question: "Explică fotosinteza.", visualMode: true }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
  });

  it("recognizes natural Romanian requests for generated pictures", () => {
    expect(isImageGenerationRequest("Poți să-mi faci o poză cu o celulă vegetală?")).toBe(true);
    expect(isImageGenerationRequest("Analizează fotografia atașată.")).toBe(false);
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Cât este 2 + 2?" }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
  });

  it("routes specialist text problems to medium and molecular structure drawings to high", () => {
    expect(modelFor({ mode: "guided", subject: "Fizică", question: "Desenează vectorul forței." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "guided", subject: "Chimie", question: "Echilibrează reacția de combustie." }))
      .toEqual({ model: "gpt-5", tier: "medium" });
    expect(modelFor({ mode: "guided", subject: "Chimie", question: "Desenează structura 2-metilbutanului." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "guided", subject: "Fizică", question: "Ce este energia?" }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
    expect(modelFor({ mode: "guided", subject: "Chimie", question: "Ce este o moleculă?" }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
    expect(modelFor({ mode: "guided", subject: "Fizică", question: "Rezolvă problema pas cu pas." }))
      .toEqual({ model: "gpt-5", tier: "medium" });
  });

  it("falls back through configured models and reports which model succeeded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tried: string[] = [];
    const result = await invokeTutorWithFallback(
      { model: "gpt-5-mini", tier: "low" },
      async (model) => {
        tried.push(model);
        if (model === "gpt-5-mini") throw new Error("model unavailable");
        return "Răspuns";
      },
    );

    expect(tried).toEqual(["gpt-5-mini", "gpt-5"]);
    expect(result).toEqual({ result: "Răspuns", model: "gpt-5", tier: "medium" });
  });
});
