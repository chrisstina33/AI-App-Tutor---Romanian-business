import type { SchematicDiagram } from "../shared/tutor-diagram";

const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const px = (value: number) => 18 + value * 2.84;
const py = (value: number) => 12 + value * 1.76;
const stroke = `stroke="#403875" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"`;

function labelSvg(text: string, x: number, y: number): string {
  return text
    ? `<text x="${x + 7}" y="${y - 7}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#292640">${escapeXml(text)}</text>`
    : "";
}

function elementSvg(element: SchematicDiagram["elements"][number]): string {
  if (element.type === "line") {
    const x1 = px(element.x1);
    const y1 = py(element.y1);
    const x2 = px(element.x2);
    const y2 = py(element.y2);
    const arrow = element.arrow
      ? (() => {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 8;
          const left = `${x2 - head * Math.cos(angle - 0.48)} ${y2 - head * Math.sin(angle - 0.48)}`;
          const right = `${x2 - head * Math.cos(angle + 0.48)} ${y2 - head * Math.sin(angle + 0.48)}`;
          return `<path d="M ${left} L ${x2} ${y2} L ${right}" ${stroke}/>`;
        })()
      : "";
    return `<path d="M ${x1} ${y1} L ${x2} ${y2}" ${stroke}/>${arrow}${labelSvg(element.label, (x1 + x2) / 2, (y1 + y2) / 2)}`;
  }
  if (element.type === "point") {
    return `<circle cx="${px(element.x)}" cy="${py(element.y)}" r="3.5" fill="#5147A8"/>${labelSvg(element.label, px(element.x), py(element.y))}`;
  }
  if (element.type === "circle") {
    const radius = element.radius * 1.7;
    return `<circle cx="${px(element.x)}" cy="${py(element.y)}" r="${radius}" ${stroke}/>${labelSvg(element.label, px(element.x), py(element.y))}`;
  }
  if (element.type === "rectangle") {
    const x = px(element.x);
    const y = py(element.y);
    return `<rect x="${x}" y="${y}" width="${element.width * 2.84}" height="${element.height * 1.76}" ${stroke}/>${labelSvg(element.label, x, y)}`;
  }
  if (element.type === "polyline") {
    const points = element.points.map((point) => `${px(point.x)},${py(point.y)}`).join(" ");
    const first = element.points[0];
    return `<polyline points="${points}" ${stroke}/>${labelSvg(element.label, px(first.x), py(first.y))}`;
  }
  return `<text x="${px(element.x)}" y="${py(element.y)}" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#292640">${escapeXml(element.text)}</text>`;
}

export function tutorDrawingSvg(drawing: SchematicDiagram): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 205" role="img" aria-label="${escapeXml(drawing.caption)}"><title>${escapeXml(drawing.caption)}</title><rect x="1" y="1" width="318" height="203" rx="14" fill="#FFFEFA" stroke="#E4E0D7"/>${drawing.elements.map(elementSvg).join("")}</svg>`;
}
