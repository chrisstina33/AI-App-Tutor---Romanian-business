import { describe, expect, it } from "vitest";
import { formatLatexForDisplay, splitMathSegments } from "../lib/math-format";

describe("math formatting", () => {
  it("turns common LaTeX into readable symbols without commands", () => {
    const formatted = formatLatexForDisplay(
      "x^2 + \\frac{a}{b} \\Rightarrow \\sqrt{4}",
    );

    expect(formatted).toBe("x² + a⁄b ⇒ √4");
    expect(formatted).not.toContain("\\");
  });

  it("keeps formula spans separate from surrounding tutor text", () => {
    expect(splitMathSegments("Pasul următor: \\(a+b=c\\)")).toEqual([
      { value: "Pasul următor: ", isMath: false },
      { value: "a+b=c", isMath: true },
    ]);
  });
});
