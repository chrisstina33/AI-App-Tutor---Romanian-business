import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeTutorWithFallback, isImageGenerationRequest, modelFor, parseTutorResponse, shouldOmitGeometryDiagram, tutorChatInputSchema } from "../server/ai";
import { buildQuickActionQuestion, buildTutorPrompt, googleImagesSearchUrl } from "../services/ai-service";
import { parseAdditionalTopics } from "../services/tutor-onboarding";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("tutor quick actions", () => {
  it("does not invent geometry points or diagrams for formula questions", () => {
    expect(shouldOmitGeometryDiagram("Matematică", "Care este formula ariei triunghiului?")).toBe(true);
    expect(shouldOmitGeometryDiagram("Matematică", "Desenează un triunghi pentru formula ariei.")).toBe(false);
    expect(shouldOmitGeometryDiagram("Fizică", "Care este formula ariei triunghiului?")).toBe(false);
    expect(buildTutorPrompt({
      subject: "Matematică",
      mode: "concept",
      question: "Care este formula ariei triunghiului?",
      history: [],
    })).toContain("fără să inventezi puncte");
  });

  it("cleans up manually entered curriculum topics", () => {
    expect(parseAdditionalTopics(" Ecuații, Funcții, Ecuații, , Proporții "))
      .toEqual(["Ecuații", "Funcții", "Proporții"]);
  });

  it("requires the learner's own work before checking a step", () => {
    expect(buildQuickActionQuestion("check", "  ")).toBeNull();
    expect(buildQuickActionQuestion("check", "", true)).toBe(
      "Verifică pasul meu din exercițiul atașat.",
    );
    expect(buildQuickActionQuestion("check", "Am obținut x = 4.")).toBe(
      "Verifică acest pas al meu: Am obținut x = 4.",
    );
  });

  it("preserves typed input when applying a quick action", () => {
    expect(buildQuickActionQuestion("hint", "Problema este 2x = 8.")).toBe(
      "Problema este 2x = 8.\n\nDă-mi un indiciu pentru problema trimisă.",
    );
  });

  it("builds an encoded Google Images query", () => {
    const url = new URL(googleImagesSearchUrl("Fizică Clasa a VIII-a forța de frecare"));
    expect(url.searchParams.get("tbm")).toBe("isch");
    expect(url.searchParams.get("q")).toBe("Fizică Clasa a VIII-a forța de frecare");
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

  it("accepts a bounded list of curriculum topics", () => {
    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      studiedTopics: ["Ecuații", "Funcții și grafice"],
    }).success).toBe(true);
    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      studiedTopics: Array.from({ length: 31 }, (_, index) => `Temă ${index}`),
    }).success).toBe(false);
  });

  it("accepts only a three-question diagnostic quiz score", () => {
    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      diagnosticScore: 0,
    }).success).toBe(true);
    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      diagnosticScore: 4,
    }).success).toBe(false);
  });

  it("accepts multiple photos but rejects attachment payloads over the request budget", () => {
    const photo = { name: "tema.jpg", mimeType: "image/jpeg" as const, base64: "aGVsbG8=" };
    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      question: "",
      attachments: [photo, { ...photo, name: "pagina-2.jpg" }],
    }).success).toBe(true);

    expect(tutorChatInputSchema.safeParse({
      ...baseInput,
      attachments: [
        { ...photo, base64: "x".repeat(14_000_000) },
        { ...photo, base64: "x".repeat(14_000_000) },
        { ...photo, base64: "x".repeat(14_000_000) },
      ],
    }).success).toBe(false);
  });

  it("routes explicit visual requests to high complexity and simple questions to low", () => {
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Desenează un paralelogram." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "direct", subject: "Biologie", question: "Generează o imagine a unei celule vegetale." }))
      .toEqual({ model: "gpt-5.5", tier: "high" });
    expect(modelFor({ mode: "direct", subject: "Biologie", question: "Analizează fotografia temei atașate." }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
    expect(modelFor({ mode: "concept", subject: "Biologie", question: "Explică fotosinteza.", visualMode: true }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
  });

  it("recognizes natural Romanian requests for generated pictures", () => {
    expect(isImageGenerationRequest("Poți să-mi faci o poză cu o celulă vegetală?")).toBe(true);
    expect(isImageGenerationRequest("Analizează fotografia atașată.")).toBe(false);
    expect(modelFor({ mode: "guided", subject: "Matematică", question: "Cât este 2 + 2?" }))
      .toEqual({ model: "gpt-5-mini", tier: "low" });
  });

  it("accepts computer science as a tutor analysis subject", () => {
    const response = parseTutorResponse(JSON.stringify({
      title: "Pașii algoritmului",
      text: "Un algoritm descrie pașii pentru rezolvarea unei probleme.",
      analysis: { subject: "Informatică", schoolLevel: "liceu", difficulty: "ușor", confidence: 0.95, mastery: "unknown" },
      diagram: null,
      imagePrompt: null,
    }));

    expect(response.analysis.subject).toBe("Informatică");
  });

  it("recognizes the added geography and English subjects", () => {
    for (const subject of ["Geografie", "Limba engleză"] as const) {
      const response = parseTutorResponse(JSON.stringify({
        title: `Exercițiu de ${subject}`,
        text: "Să rezolvăm cerința pas cu pas.",
        analysis: { subject, schoolLevel: "liceu", difficulty: "ușor", confidence: 0.9, mastery: "unknown" },
        diagram: null,
        imagePrompt: null,
      }));
      expect(response.analysis.subject).toBe(subject);
    }
  });

  it("accepts history and olympiad-level tutor analysis while retaining unknown fallbacks", () => {
    const response = parseTutorResponse(JSON.stringify({
      title: "Analiza sursei istorice",
      text: "Să identificăm mai întâi sursa istorică.",
      analysis: { subject: "Istorie", schoolLevel: "olimpiada", difficulty: "mediu", confidence: 0.95, mastery: "unknown" },
      diagram: null,
      imagePrompt: null,
    }));

    expect(response.analysis).toMatchObject({ subject: "Istorie", schoolLevel: "olimpiada" });
    expect(() => parseTutorResponse(JSON.stringify({
      title: "Contextul necesar",
      text: "Am nevoie de mai mult context.",
      analysis: { subject: "necunoscut", schoolLevel: "necunoscut", difficulty: "necunoscut", confidence: 0.2, mastery: "unknown" },
      diagram: null,
      imagePrompt: null,
    }))).not.toThrow();
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
