import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeTutorWithFallback, modelFor, tutorChatInputSchema } from "../server/ai";

afterEach(() => vi.restoreAllMocks());

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

  it("routes geometry requests to gpt-5 while leaving routine questions on gpt-5-mini", () => {
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Desenează un paralelogram." }))
      .toEqual({ model: "gpt-5", tier: "extended" });
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Cât este 2 + 2?" }))
      .toEqual({ model: "gpt-5-mini", tier: "routine" });
  });

  it("routes specialist physics and chemistry requests to gpt-5", () => {
    expect(modelFor({ mode: "guided", subject: "Fizică", question: "Desenează vectorul forței." }))
      .toEqual({ model: "gpt-5", tier: "extended" });
    expect(modelFor({ mode: "guided", subject: "Chimie", question: "Echilibrează reacția de combustie." }))
      .toEqual({ model: "gpt-5", tier: "extended" });
  });

  it("falls back through configured models and reports which model succeeded", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const tried: string[] = [];
    const result = await invokeTutorWithFallback(
      { model: "gpt-5-mini", tier: "routine" },
      async (model) => {
        tried.push(model);
        if (model === "gpt-5-mini") throw new Error("model unavailable");
        return "Răspuns";
      },
    );

    expect(tried).toEqual(["gpt-5-mini", "gpt-5"]);
    expect(result).toEqual({ result: "Răspuns", model: "gpt-5", tier: "extended" });
  });
});
