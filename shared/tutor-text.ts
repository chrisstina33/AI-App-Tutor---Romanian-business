const mathExpression =
  /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g;

function cleanPlainText(value: string): string {
  return value
    .replace(/\$/g, "")
    .replace(/(?<!\d)%/g, "")
    .replace(/[ \t]{2,}/g, " ");
}

function cleanMathText(value: string): string {
  return value
    .replace(/(?<!\\)(\d)%/g, "$1\\%")
    .replace(/(?<!\\)(?<!\d)%/g, "");
}

export function normalizeTutorResponseText(value: string): string {
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mathExpression.exec(value))) {
    output += cleanPlainText(value.slice(cursor, match.index));
    output += match[0].replace(
      /\\\(([\s\S]+?)\\\)|\\\[([\s\S]+?)\\\]|\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)(?<!\\)\$/g,
      (expression, inlineParen: string | undefined, displayBracket: string | undefined, displayDollar: string | undefined, inlineDollar: string | undefined) => {
        const formula = inlineParen ?? displayBracket ?? displayDollar ?? inlineDollar;
        if (formula === undefined) return expression;
        const cleaned = cleanMathText(formula);
        if (inlineParen !== undefined) return `\\(${cleaned}\\)`;
        if (displayBracket !== undefined) return `\\[${cleaned}\\]`;
        if (displayDollar !== undefined) return `$$${cleaned}$$`;
        return `$${cleaned}$`;
      },
    );
    cursor = mathExpression.lastIndex;
  }

  output += cleanPlainText(value.slice(cursor));
  mathExpression.lastIndex = 0;
  return output.replace(/\n{3,}/g, "\n\n").replace(/\s+([,.;!?])/g, "$1").trim();
}

export function normalizeTutorTitle(value: string): string {
  const title = value
    .replace(/[$%#*_`~]/g, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s.,:;!?—–-]+|[\s.,:;!?—–-]+$/g, "")
    .trim()
    .slice(0, 64);

  return title.length >= 3 ? title : "Lecție nouă";
}
