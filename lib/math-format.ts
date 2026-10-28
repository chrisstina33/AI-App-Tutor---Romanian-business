export type MathSegment = { value: string; isMath: boolean };

const COMMANDS: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  theta: "θ",
  lambda: "λ",
  mu: "μ",
  pi: "π",
  sigma: "σ",
  omega: "ω",
  Delta: "Δ",
  Sigma: "Σ",
  Omega: "Ω",
  times: "×",
  cdot: "·",
  div: "÷",
  pm: "±",
  neq: "≠",
  approx: "≈",
  leq: "≤",
  le: "≤",
  geq: "≥",
  ge: "≥",
  rightarrow: "→",
  to: "→",
  Rightarrow: "⇒",
  leftarrow: "←",
  Leftarrow: "⇐",
  infty: "∞",
  sum: "∑",
  prod: "∏",
  int: "∫",
  degree: "°",
};

const SUPERSCRIPTS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
};
const SUBSCRIPTS: Record<string, string> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
};

function scriptCharacters(
  value: string,
  alphabet: Record<string, string>,
): string {
  return [...value]
    .map((character) => alphabet[character] ?? character)
    .join("");
}

/** Readable fallback for native text and offline PDF printing; full PDF typesetting uses MathJax. */
export function formatLatexForDisplay(input: string): string {
  let value = input
    .replace(/\\(?:left|right|displaystyle|textstyle)\b/g, "")
    .replace(/\\(?:,|;|!|quad|qquad)\b/g, " ");

  for (let pass = 0; pass < 4; pass += 1) {
    value = value
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1⁄$2")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1")
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\^\{([^{}]*)\}/g, (_match, group: string) =>
        scriptCharacters(group, SUPERSCRIPTS),
      )
      .replace(/_\{([^{}]*)\}/g, (_match, group: string) =>
        scriptCharacters(group, SUBSCRIPTS),
      );
  }

  value = value
    .replace(/\^([0-9a-zA-Z+-])/g, (_match, character: string) =>
      scriptCharacters(character, SUPERSCRIPTS),
    )
    .replace(/_([0-9a-zA-Z+-])/g, (_match, character: string) =>
      scriptCharacters(character, SUBSCRIPTS),
    )
    .replace(
      /\\([a-zA-Z]+)/g,
      (_match, command: string) => COMMANDS[command] ?? "",
    )
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

export function splitMathSegments(line: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const expression = /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(line))) {
    if (match.index > cursor)
      segments.push({ value: line.slice(cursor, match.index), isMath: false });
    segments.push({ value: match[1] ?? match[2] ?? "", isMath: true });
    cursor = expression.lastIndex;
  }

  if (cursor < line.length)
    segments.push({ value: line.slice(cursor), isMath: false });
  return segments.length ? segments : [{ value: line, isMath: false }];
}
