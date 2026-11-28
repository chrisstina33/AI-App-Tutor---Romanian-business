import { describe, expect, it } from "vitest";
import { modelFor, parseTutorResponse } from "../server/ai";

describe("tutor model selection", () => {
  it("uses the medium tier for visual explanations without an explicit image request", () => {
    expect(modelFor({
      mode: "concept",
      question: "Explică fotosinteza",
      visualMode: true,
    })).toEqual({ model: "gpt-5", tier: "medium" });
  });

  it("keeps explicit image requests on the high tier", () => {
    expect(modelFor({
      mode: "concept",
      question: "Generează o imagine cu fotosinteza",
      visualMode: true,
    })).toEqual({ model: "gpt-5.5", tier: "high" });
  });
});

describe("structured tutor responses", () => {
  it("uses the generated title and removes stray formatting symbols from the answer", () => {
    const response = parseTutorResponse(JSON.stringify({
      title: "Fracții $ și # procente",
      text: "25% din $x$ este $y$ $ %.",
      analysis: {
        subject: "Matematică",
        schoolLevel: "gimnaziu",
        difficulty: "ușor",
        confidence: 1,
        mastery: "unknown",
      },
      diagram: null,
      imagePrompt: null,
    }));

    expect(response.title).toBe("Fracții și procente");
    expect(response.text).toBe("25% din $x$ este $y$.");
  });

  it("marks deterministic geometry output as schematic", () => {
    const response = parseTutorResponse(JSON.stringify({
      title: "Laturile triunghiului ABC",
      text: "Observă laturile triunghiului.",
      analysis: {
        subject: "Matematică",
        schoolLevel: "gimnaziu",
        difficulty: "ușor",
        confidence: 1,
        mastery: "unknown",
      },
      diagram: {
        category: "geometry",
        caption: "Triunghiul ABC",
        schematic: false,
        constraints: [],
        figure: "triangle",
        points: [
          { id: "A", label: "A" },
          { id: "B", label: "B" },
          { id: "C", label: "C" },
        ],
        segments: [
          { id: "AB", from: "A", to: "B", label: "", lineType: "segment" },
          { id: "BC", from: "B", to: "C", label: "", lineType: "segment" },
          { id: "CA", from: "C", to: "A", label: "", lineType: "segment" },
        ],
        angles: [],
        relations: [],
        circles: [],
      },
      imagePrompt: null,
    }));

    expect(response.diagram?.category).toBe("geometry");
    if (response.diagram?.category === "geometry") {
      expect(response.diagram.schematic).toBe(true);
    }
  });
});
