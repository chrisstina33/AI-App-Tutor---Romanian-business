import type { TutorDrawing, TutorDrawingElement } from "@/shared/tutor-drawing";

const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

const px = (value: number) => 18 + value * 2.84;
const py = (value: number) => 12 + value * 1.76;
const textAttributes = `font-family="cursive" font-size="13" font-style="italic" fill="#303954"`;

function elementSvg(element: TutorDrawingElement, index: number): string {
  const label = (text: string | undefined, x: number, y: number) => text
    ? `<text x="${px(x) + 5}" y="${py(y) - 5}" ${textAttributes}>${escapeXml(text)}</text>`
    : "";
  const stroke = `stroke="#34405D" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  if (element.type === "line") {
    const x1 = px(element.x1); const y1 = py(element.y1); const x2 = px(element.x2); const y2 = py(element.y2);
    const path = `M ${x1} ${y1} L ${x2} ${y2}`;
    const arrow = element.arrow
      ? (() => {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const head = 8;
          const left = `${x2 - head * Math.cos(angle - 0.48)} ${y2 - head * Math.sin(angle - 0.48)}`;
          const right = `${x2 - head * Math.cos(angle + 0.48)} ${y2 - head * Math.sin(angle + 0.48)}`;
          return `<path d="M ${left} L ${x2} ${y2} L ${right}" ${stroke}/>`;
        })()
      : "";
    return `<path d="${path}" ${stroke}/><path d="${path}" transform="translate(1,0.8)" stroke="#596785" stroke-width="1" opacity=".28" fill="none"/>${arrow}${label(element.label, (element.x1 + element.x2) / 2, (element.y1 + element.y2) / 2)}`;
  }
  if (element.type === "point") {
    return `<circle cx="${px(element.x)}" cy="${py(element.y)}" r="3.5" fill="#5147A8" stroke="#FFFFFF" stroke-width="1.2"/>${label(element.label, element.x, element.y)}`;
  }
  if (element.type === "circle") {
    const radius = Math.max(2, Math.min(100, element.radius)) * 1.7;
    return `<circle cx="${px(element.x)}" cy="${py(element.y)}" r="${radius}" ${stroke}/><circle cx="${px(element.x) + 1}" cy="${py(element.y) + 0.8}" r="${radius}" stroke="#596785" stroke-width=".8" opacity=".25" fill="none"/>${label(element.label, element.x, element.y)}`;
  }
  if (element.type === "rectangle") {
    const x = px(element.x); const y = py(element.y); const width = Math.max(2, element.width * 2.84); const height = Math.max(2, element.height * 1.76);
    return `<path d="M ${x} ${y + 1} L ${x + width - 2} ${y} L ${x + width} ${y + height - 1} L ${x + 1} ${y + height} Z" ${stroke}/><path d="M ${x + 1} ${y + 2} L ${x + width - 1} ${y + 1} L ${x + width - 1} ${y + height - 2}" stroke="#596785" stroke-width=".8" opacity=".26" fill="none"/>${label(element.label, element.x, element.y)}`;
  }
  if (element.type === "polyline") {
    const points = element.points.map((point) => `${px(point.x)},${py(point.y)}`).join(" ");
    return `<polyline points="${points}" ${stroke}/><polyline points="${points}" transform="translate(1,.8)" stroke="#596785" stroke-width=".8" opacity=".25" fill="none"/>${label(element.label, element.points[0]?.x ?? 4, element.points[0]?.y ?? 8)}`;
  }
  return `<text x="${px(element.x)}" y="${py(element.y)}" ${textAttributes}>${escapeXml(element.text)}</text>`;
}

export function tutorDrawingSvg(drawing: TutorDrawing): string {
  const grid = Array.from({ length: 15 }, (_, index) => {
    const x = 18 + index * 20;
    return `<path d="M ${x} 10 V 190" stroke="#DCE4EF" stroke-width=".55"/>`;
  }).join("") + Array.from({ length: 10 }, (_, index) => {
    const y = 12 + index * 19;
    return `<path d="M 18 ${y} H 302" stroke="#DCE4EF" stroke-width=".55"/>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 205" role="img" aria-label="${escapeXml(drawing.caption)}"><rect x="1" y="1" width="318" height="203" rx="14" fill="#FFFEFA" stroke="#D9D6CC"/>${grid}${drawing.elements.map(elementSvg).join("")}</svg>`;
}
