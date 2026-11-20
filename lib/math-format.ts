export type MathSegment = { value: string; isMath: boolean };

export function sanitizeTutorMathText(input: string): string {
  let value = input.replace(
    /^[ \t]*\[[ \t]*\n([\s\S]*?)\n[ \t]*\][ \t]*$/gm,
    (_match, formula: string) => `$$${formula}$$`,
  );

  value = value
    .replace(/\$\$([\s\S]+?)\$\$/g, (_match, formula: string) =>
      `\\[${formula.replace(/\s*\n\s*/g, " ").trim()}\\]`,
    )
    .replace(/\$([^$\n]+?)\$/g, (_match, formula: string) => `\\(${formula}\\)`);

  const savedEnvironments: string[] = [];
  value = value.replace(/\\(?:begin|end)\{[pbv]matrix\}/g, (environment) => {
    const token = `\u0000MATRIX${savedEnvironments.length}\u0000`;
    savedEnvironments.push(environment);
    return token;
  });

  value = value.replace(
    /(?<![\\a-zA-Z])(pmatrix|bmatrix|vmatrix)([\s\S]*?)(?<!\\)\1/g,
    (_match, environment: string, body: string) =>
      `\\begin{${environment}}${body.replace(/;\s*/g, " \\\\ ")}\\end{${environment}}`,
  );

  value = value.replace(
    /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]/g,
    (match, inline: string | undefined, display: string | undefined) => {
      const formula = inline ?? display ?? "";
      const repaired = formula.replace(
        /(?<![\\a-zA-Z])(?:sum|prod|int|frac|sqrt|binom|cdot|times|pm|neq|leq|geq|rightarrow|infty)(?=$|[^a-zA-Z])/g,
        (command) => `\\${command}`,
      );
      return inline !== undefined
        ? `\\(${repaired}\\)`
        : `\\[${repaired}\\]`;
    },
  );

  value = value.replace(/\u0000MATRIX(\d+)\u0000/g, (_match, index: string) =>
    savedEnvironments[Number(index)],
  );

  return value.replace(/\n{3,}/g, "\n\n");
}

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
  partial: "∂",
  nabla: "∇",
  perp: "⊥",
  parallel: "∥",
  angle: "∠",
  triangle: "△",
  in: "∈",
  notin: "∉",
  sum: "∑",
  prod: "∏",
  int: "∫",
  degree: "°",
  sin: "sin",
  cos: "cos",
  tan: "tan",
  log: "log",
  ln: "ln",
  lim: "lim",
  max: "max",
  min: "min",
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
    .replace(
      /\\begin\{(matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\}([\s\S]*?)\\end\{\1\}/g,
      (_match, type: string, body: string) => {
        const [open, close] = type === "pmatrix"
          ? ["[", "]"]
          : type === "bmatrix"
            ? ["⎡", "⎤"]
            : type === "Bmatrix"
              ? ["{", "}"]
              : type === "vmatrix"
                ? ["|", "|"]
                : type === "Vmatrix"
                  ? ["‖", "‖"]
                  : ["⎡", "⎤"];
        return `${open}${body.replace(/\s*\\\\\s*/g, "; ").replace(/&/g, "  ")}${close}`;
      },
    )
    .replace(
      /\\begin\{cases\}([\s\S]*?)\\end\{cases\}/g,
      (_match, body: string) => body.replace(/\s*\\\\\s*/g, "; ").replace(/&/g, ": "),
    )
    .replace(/\\(?:left|right|displaystyle|textstyle)\b/g, "")
    .replace(/\\(?:,|;|!|quad|qquad)\b/g, " ");

  for (let pass = 0; pass < 4; pass += 1) {
    value = value
      .replace(/\\begin\{(?:aligned|array|cases|split)\}|\\end\{(?:aligned|array|cases|split)\}/g, "")
      .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1⁄$2")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1")
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, "$1")
      .replace(/\^\{([^{}]*)\}/g, (_match, group: string) =>
        scriptCharacters(group, SUPERSCRIPTS),
      )
      .replace(/_\{([^{}]*)\}/g, (_match, group: string) =>
        scriptCharacters(group, SUBSCRIPTS),
      )
      .replace(/\\\\/g, "; ")
      .replace(/&/g, " ");
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
    .replace(/(?<=[\w)}])\/(?=[\w({])/g, "⁄")
    .replace(/[{}]/g, "")
    .replace(/\\/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

export function splitMathSegments(line: string): MathSegment[] {
  const segments: MathSegment[] = [];
  const expression =
    /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = expression.exec(line))) {
    if (match.index > cursor)
      segments.push({ value: line.slice(cursor, match.index), isMath: false });
    segments.push({
      value: match[1] ?? match[2] ?? match[3] ?? match[4] ?? "",
      isMath: true,
    });
    cursor = expression.lastIndex;
  }

  if (cursor < line.length)
    segments.push({ value: line.slice(cursor), isMath: false });
  return segments.length ? segments : [{ value: line, isMath: false }];
}
