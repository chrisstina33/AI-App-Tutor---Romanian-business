import { describe, expect, it } from "vitest";
import { normalizeTutorResponseText, normalizeTutorTitle } from "../shared/tutor-text";

describe("tutor response text cleanup", () => {
  it("removes stray symbols while preserving formulas and numeric percentages", () => {
    expect(normalizeTutorResponseText("Rezultatul este $x^2 + 1$ și 25%. $ Atenție % aici"))
      .toBe("Rezultatul este $x^2 + 1$ și 25%. Atenție aici");
  });

  it("preserves spacing around formulas and parenthesized math", () => {
    expect(normalizeTutorResponseText("Valoarea este \\(a+b\\), iar apoi $c$."))
      .toBe("Valoarea este \\(a+b\\), iar apoi $c$.");
  });

  it("keeps a valid percentage inside a formula and removes stray percent signs", () => {
    expect(normalizeTutorResponseText("$25% + x%$")).toBe("$25\\% + x$");
  });

  it("cleans generated titles and bounds their displayed length", () => {
    expect(normalizeTutorTitle("  Procente $ și # fracții  ")).toBe("Procente și fracții");
    expect(normalizeTutorTitle("x".repeat(80))).toHaveLength(64);
  });
});
