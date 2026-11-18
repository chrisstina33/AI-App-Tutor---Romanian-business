import { describe, expect, it } from "vitest";
import {
  formatLatexForDisplay,
  sanitizeTutorMathText,
  splitMathSegments,
} from "../lib/math-format";

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

  it("recognizes dollar delimiters and normalizes display blocks", () => {
    expect(splitMathSegments("Rezultatul este $x^2$.")).toEqual([
      { value: "Rezultatul este ", isMath: false },
      { value: "x^2", isMath: true },
      { value: ".", isMath: false },
    ]);

    expect(sanitizeTutorMathText("Formula:\n$$\n\\sum_{k=0}^{n}\n$$")).toBe(
      "Formula:\n\\[\\sum_{k=0}^{n}\\]",
    );
    expect(sanitizeTutorMathText("[\nx+y=2\n]")).toBe("\\[x+y=2\\]");
  });

  it("repairs unescaped matrix environments into a readable native form", () => {
    const repaired = sanitizeTutorMathText("pmatrix1-k -k; k k+1pmatrix");

    expect(repaired).toBe(
      "\\begin{pmatrix}1-k -k \\\\ k k+1\\end{pmatrix}",
    );
    expect(formatLatexForDisplay(repaired)).toBe("[1-k -k; k k+1]");
    expect(sanitizeTutorMathText("Formula este $sum_{k=0}^{n}$.")).toBe(
      "Formula este \\(\\sum_{k=0}^{n}\\).",
    );
    expect(sanitizeTutorMathText("Această sumă este simplă.")).toBe(
      "Această sumă este simplă.",
    );
  });

  it("cleans nested fractions and aligned formula markup for phone display", () => {
    const formatted = formatLatexForDisplay(
      "\\begin{aligned}\\frac{\\frac{a}{b}}{c} &= x/y\\\\x &= 2\\end{aligned}",
    );

    expect(formatted).toBe("a⁄b⁄c = x⁄y; x = 2");
    expect(formatted).not.toMatch(/[\\{}]/);
  });
});
