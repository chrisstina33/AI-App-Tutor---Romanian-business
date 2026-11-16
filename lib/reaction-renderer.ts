import type { ReactionDiagram } from "../shared/tutor-diagram";

const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function speciesSvg(
  species: ReactionDiagram["reactants"][number],
  x: number,
  y: number,
): string {
  const coefficient = species.coefficient > 1
    ? `<tspan font-size="13">${species.coefficient}</tspan>`
    : "";
  const formula = species.formula.replace(/([A-Z][a-z]?)(\d*)|([()[\].·])/g, (token, element: string | undefined, count: string | undefined) => {
    if (element) {
      const subscript = count
        ? `<tspan font-size="12" baseline-shift="sub">${count}</tspan>`
        : "";
      return `${escapeXml(element)}${subscript}`;
    }
    return escapeXml(token);
  });
  const state = species.state
    ? `<text x="${x}" y="${y + 22}" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#68657A">(${species.state})</text>`
    : "";
  return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="18" font-weight="600" fill="#292640">${coefficient}${formula}</text>${state}`;
}

function sideSvg(species: ReactionDiagram["reactants"], start: number, end: number): string {
  const gap = (end - start) / species.length;
  return species.map((item, index) => {
    const x = start + gap * (index + 0.5);
    const previousPlus = index > 0
      ? `<text x="${start + gap * index}" y="66" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#68657A">+</text>`
      : "";
    return `${previousPlus}${speciesSvg(item, x, 66)}`;
  }).join("");
}

export function reactionDiagramSvg(diagram: ReactionDiagram): string {
  const conditions = diagram.conditions
    ? `<text x="360" y="25" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#68657A">${escapeXml(diagram.conditions)}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 125" role="img" aria-label="${escapeXml(diagram.caption)}"><title>${escapeXml(diagram.caption)}</title><rect x="1" y="1" width="718" height="123" rx="14" fill="#FFFEFA" stroke="#E4E0D7"/>${conditions}${sideSvg(diagram.reactants, 18, 290)}<path d="M 316 66 L 404 66 M 394 58 L 404 66 L 394 74" fill="none" stroke="#403875" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${sideSvg(diagram.products, 430, 702)}</svg>`;
}
