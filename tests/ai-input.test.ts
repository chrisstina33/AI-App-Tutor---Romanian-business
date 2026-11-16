import { describe, expect, it } from "vitest";
import { tutorChatInputSchema } from "../server/ai";

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
});
