import type { GeometryDiagram } from "../shared/tutor-diagram";

type Point = { x: number; y: number };
type PositionedPoint = Point & { id: string; label: string };

const WIDTH = 320;
const HEIGHT = 210;
const STROKE = "#403875";
const ACCENT = "#A85C43";
const TEXT = "#292640";

const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function polygonOrder(diagram: GeometryDiagram): string[] {
  const ids = diagram.points.map((point) => point.id);
  const adjacency = new Map(ids.map((id) => [id, [] as string[]]));
  for (const segment of diagram.segments) {
    if (segment.lineType !== "segment" || !adjacency.has(segment.from) || !adjacency.has(segment.to)) continue;
    adjacency.get(segment.from)!.push(segment.to);
    adjacency.get(segment.to)!.push(segment.from);
  }
  if (ids.length >= 3 && [...adjacency.values()].every((neighbors) => neighbors.length === 2)) {
    const order = [ids[0]];
    let previous: string | undefined;
    while (order.length < ids.length) {
      const current = order[order.length - 1];
      const next = adjacency.get(current)!.find((neighbor) => neighbor !== previous);
      if (!next || next === order[0] || order.includes(next)) break;
      order.push(next);
      previous = current;
    }
    if (order.length === ids.length && adjacency.get(order[order.length - 1])!.includes(order[0])) return order;
  }
  return ids;
}

function trianglePositions(diagram: GeometryDiagram, order: string[]): Map<string, Point> {
  const equalRelations = diagram.relations.filter((relation) => relation.type === "equal_length");
  const equalSegments = new Set(equalRelations.flatMap((relation) => [relation.firstSegment, relation.secondSegment]));
  const allSidesEqual = diagram.segments.filter((segment) => segment.lineType === "segment").length === 3
    && diagram.segments.filter((segment) => equalSegments.has(segment.id)).length === 3;
  if (allSidesEqual) {
    return new Map([[order[0], { x: 160, y: 38 }], [order[1], { x: 57, y: 174 }], [order[2], { x: 263, y: 174 }]]);
  }

  const rightAngle = diagram.angles.find((angle) => angle.marker === "right");
  if (rightAngle) {
    const sidePoints = [rightAngle.ray1, rightAngle.ray2];
    return new Map([
      [rightAngle.vertex, { x: 88, y: 151 }],
      [sidePoints[0], { x: 88, y: 56 }],
      [sidePoints[1], { x: 183, y: 151 }],
    ]);
  }

  const equality = equalRelations[0];
  const first = diagram.segments.find((segment) => segment.id === equality?.firstSegment);
  const second = diagram.segments.find((segment) => segment.id === equality?.secondSegment);
  const shared = first && second
    ? [first.from, first.to].find((id) => id === second.from || id === second.to)
    : undefined;
  if (shared) {
    const base = order.filter((id) => id !== shared);
    return new Map([[shared, { x: 160, y: 38 }], [base[0], { x: 57, y: 174 }], [base[1], { x: 263, y: 174 }]]);
  }
  return new Map([[order[0], { x: 160, y: 38 }], [order[1], { x: 57, y: 174 }], [order[2], { x: 263, y: 174 }]]);
}

export function layoutGeometryPoints(diagram: GeometryDiagram): PositionedPoint[] {
  const order = polygonOrder(diagram);
  const positions = new Map<string, Point>();
  if (diagram.figure === "triangle") {
    for (const [id, point] of trianglePositions(diagram, order)) positions.set(id, point);
  } else if (diagram.figure === "rectangle" || diagram.figure === "square") {
    const halfWidth = diagram.figure === "square" ? 62 : 98;
    const halfHeight = diagram.figure === "square" ? 62 : 55;
    [order[0], order[1], order[2], order[3]].forEach((id, index) => {
      positions.set(id, [
        { x: 160 - halfWidth, y: 105 - halfHeight },
        { x: 160 + halfWidth, y: 105 - halfHeight },
        { x: 160 + halfWidth, y: 105 + halfHeight },
        { x: 160 - halfWidth, y: 105 + halfHeight },
      ][index]);
    });
  } else if (diagram.figure === "intersecting_lines") {
    const lines = diagram.segments.filter((segment) => segment.lineType === "line").slice(0, 2);
    const perpendicular = diagram.relations.some((relation) => relation.type === "perpendicular"
      && lines.every((line) => [relation.firstSegment, relation.secondSegment].includes(line.id)));
    const firstAngle = -Math.PI / 6;
    const directions = [firstAngle, perpendicular ? firstAngle + Math.PI / 2 : firstAngle + Math.PI / 3];
    lines.forEach((line, index) => {
      const angle = directions[index];
      const dx = Math.cos(angle) * 112;
      const dy = Math.sin(angle) * 112;
      positions.set(line.from, { x: 160 - dx, y: 105 - dy });
      positions.set(line.to, { x: 160 + dx, y: 105 + dy });
    });
    const unused = diagram.points.filter((point) => !positions.has(point.id));
    const center = unused.find((point) => point.label.toUpperCase() === "O" || point.id.toUpperCase() === "O") ?? unused[0];
    if (center) positions.set(center.id, { x: 160, y: 105 });
    unused.filter((point) => point.id !== center?.id).forEach((point, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(unused.length - 1, 1);
      positions.set(point.id, { x: 160 + Math.cos(angle) * 25, y: 105 + Math.sin(angle) * 25 });
    });
  } else if (diagram.figure === "circle") {
    const perimeter = diagram.points.filter((point) => !diagram.circles.some((circle) => circle.center === point.id));
    diagram.circles.forEach((circle) => positions.set(circle.center, { x: 160, y: 105 }));
    perimeter.forEach((point, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(perimeter.length, 1);
      positions.set(point.id, { x: 160 + Math.cos(angle) * 55, y: 105 + Math.sin(angle) * 55 });
    });
  } else {
    order.forEach((id, index) => {
      const angle = -Math.PI / 2 + (index * 2 * Math.PI) / Math.max(order.length, 3);
      positions.set(id, { x: 160 + Math.cos(angle) * 95, y: 105 + Math.sin(angle) * 66 });
    });
  }
  return diagram.points.map((point) => ({ ...(positions.get(point.id) ?? { x: 160, y: 105 }), ...point }));
}

function endpoint(pointMap: Map<string, PositionedPoint>, id: string): Point {
  return pointMap.get(id)!;
}

function lineEndpoints(diagram: GeometryDiagram, pointMap: Map<string, PositionedPoint>, segment: GeometryDiagram["segments"][number]): [Point, Point] {
  const start = endpoint(pointMap, segment.from);
  const end = endpoint(pointMap, segment.to);
  if (segment.lineType !== "line") return [start, end];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const unitX = dx / length;
  const unitY = dy / length;
  return [
    { x: start.x - unitX * 100, y: start.y - unitY * 100 },
    { x: end.x + unitX * 100, y: end.y + unitY * 100 },
  ];
}

function svgLine(from: Point, to: Point, extra = ""): string {
  return `<path d="M ${from.x} ${from.y} L ${to.x} ${to.y}" fill="none" stroke="${STROKE}" stroke-width="2.2" stroke-linecap="round" ${extra}/>`;
}

function labelSvg(text: string, x: number, y: number, anchor = "middle"): string {
  if (!text) return "";
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="central" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="${TEXT}">${escapeXml(text)}</text>`;
}

function angleSvg(diagram: GeometryDiagram, pointMap: Map<string, PositionedPoint>, angle: GeometryDiagram["angles"][number]): string {
  const vertex = endpoint(pointMap, angle.vertex);
  const ray1 = endpoint(pointMap, angle.ray1);
  const ray2 = endpoint(pointMap, angle.ray2);
  const a1 = Math.atan2(ray1.y - vertex.y, ray1.x - vertex.x);
  const a2 = Math.atan2(ray2.y - vertex.y, ray2.x - vertex.x);
  let delta = ((a2 - a1 + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (Math.abs(delta) < 0.02) return "";
  const ux = Math.cos(a1);
  const uy = Math.sin(a1);
  const vx = Math.cos(a2);
  const vy = Math.sin(a2);
  if (angle.marker === "right") {
    const size = 13;
    const p1 = { x: vertex.x + ux * size, y: vertex.y + uy * size };
    const p2 = { x: p1.x + vx * size, y: p1.y + vy * size };
    const p3 = { x: vertex.x + vx * size, y: vertex.y + vy * size };
    return `<path d="M ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y}" fill="none" stroke="${ACCENT}" stroke-width="1.8"/>`;
  }
  const radius = 19;
  const start = { x: vertex.x + ux * radius, y: vertex.y + uy * radius };
  const end = { x: vertex.x + vx * radius, y: vertex.y + vy * radius };
  const sweep = delta > 0 ? 1 : 0;
  const mid = a1 + delta / 2;
  const label = labelSvg(angle.label, vertex.x + Math.cos(mid) * 31, vertex.y + Math.sin(mid) * 31);
  return `<path d="M ${start.x} ${start.y} A ${radius} ${radius} 0 0 ${sweep} ${end.x} ${end.y}" fill="none" stroke="${ACCENT}" stroke-width="1.8"/>${label}`;
}

function intersect(a: Point, b: Point, c: Point, d: Point): Point | null {
  const cross = (x: Point, y: Point) => x.x * y.y - x.y * y.x;
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denominator = cross(r, s);
  if (Math.abs(denominator) < 0.001) return null;
  const t = cross({ x: c.x - a.x, y: c.y - a.y }, s) / denominator;
  const u = cross({ x: c.x - a.x, y: c.y - a.y }, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * r.x, y: a.y + t * r.y };
}

function relationSvg(diagram: GeometryDiagram, pointMap: Map<string, PositionedPoint>): string {
  return diagram.relations.map((relation) => {
    const first = diagram.segments.find((segment) => segment.id === relation.firstSegment)!;
    const second = diagram.segments.find((segment) => segment.id === relation.secondSegment)!;
    const [a, b] = lineEndpoints(diagram, pointMap, first);
    const [c, d] = lineEndpoints(diagram, pointMap, second);
    if (relation.type === "equal_length") {
      return [first, second].map((segment) => {
        const [start, end] = lineEndpoints(diagram, pointMap, segment);
        const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const nx = -(end.y - start.y) / length * 6;
        const ny = (end.x - start.x) / length * 6;
        return svgLine({ x: middle.x - nx, y: middle.y - ny }, { x: middle.x + nx, y: middle.y + ny }, `stroke="${ACCENT}" stroke-width="1.8"`);
      }).join("");
    }
    if (relation.type === "parallel") {
      return [first, second].map((segment) => {
        const [start, end] = lineEndpoints(diagram, pointMap, segment);
        const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        const ux = (end.x - start.x) / length;
        const uy = (end.y - start.y) / length;
        const nx = -uy;
        const ny = ux;
        return svgLine(
          { x: middle.x - ux * 4 - nx * 4, y: middle.y - uy * 4 - ny * 4 },
          { x: middle.x + nx * 5, y: middle.y + ny * 5 },
          `stroke="${ACCENT}" stroke-width="1.8"`,
        ) + svgLine(
          { x: middle.x + nx * 5, y: middle.y + ny * 5 },
          { x: middle.x + ux * 4 - nx * 4, y: middle.y + uy * 4 - ny * 4 },
          `stroke="${ACCENT}" stroke-width="1.8"`,
        );
      }).join("");
    }
    const crossing = intersect(a, b, c, d);
    if (!crossing) return "";
    const size = 10;
    const firstLength = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const secondLength = Math.hypot(d.x - c.x, d.y - c.y) || 1;
    const firstDirection = { x: (b.x - a.x) / firstLength, y: (b.y - a.y) / firstLength };
    const secondDirection = { x: (d.x - c.x) / secondLength, y: (d.y - c.y) / secondLength };
    const firstCorner = {
      x: crossing.x + firstDirection.x * size,
      y: crossing.y + firstDirection.y * size,
    };
    const oppositeCorner = {
      x: firstCorner.x + secondDirection.x * size,
      y: firstCorner.y + secondDirection.y * size,
    };
    const secondCorner = {
      x: crossing.x + secondDirection.x * size,
      y: crossing.y + secondDirection.y * size,
    };
    return `<path d="M ${firstCorner.x} ${firstCorner.y} L ${oppositeCorner.x} ${oppositeCorner.y} L ${secondCorner.x} ${secondCorner.y}" fill="none" stroke="${ACCENT}" stroke-width="1.8"/>`;
  }).join("");
}

function vertexLabels(points: PositionedPoint[]): string {
  const labeled = points.filter((point) => point.label);
  const center = labeled.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  if (labeled.length) {
    center.x /= labeled.length;
    center.y /= labeled.length;
  }
  const occupied: Array<{ x: number; y: number; width: number }> = [];
  return labeled.map((point) => {
    const base = Math.atan2(point.y - center.y, point.x - center.x);
    const candidates = [base, base - Math.PI / 4, base + Math.PI / 4, base - Math.PI / 2, base + Math.PI / 2, base + Math.PI];
    const width = Math.max(12, point.label.length * 7);
    let chosen = { x: point.x, y: point.y - 17 };
    for (const direction of candidates) {
      const candidate = { x: point.x + Math.cos(direction) * 17, y: point.y + Math.sin(direction) * 17 };
      const collision = occupied.some((other) => Math.abs(candidate.x - other.x) < (width + other.width) / 2 + 3
        && Math.abs(candidate.y - other.y) < 15);
      if (!collision && candidate.x >= 12 && candidate.x <= WIDTH - 12 && candidate.y >= 12 && candidate.y <= HEIGHT - 12) {
        chosen = candidate;
        break;
      }
    }
    occupied.push({ ...chosen, width });
    return labelSvg(point.label, chosen.x, chosen.y);
  }).join("");
}

export function geometryDiagramSvg(diagram: GeometryDiagram): string {
  const points = layoutGeometryPoints(diagram);
  const pointMap = new Map(points.map((point) => [point.id, point]));
  const background = `<rect x="1" y="1" width="${WIDTH - 2}" height="${HEIGHT - 2}" rx="14" fill="#FFFEFA" stroke="#E4E0D7"/>`;
  const circles = diagram.circles.map((circle) => {
    const center = endpoint(pointMap, circle.center);
    return `<circle cx="${center.x}" cy="${center.y}" r="55" fill="none" stroke="${STROKE}" stroke-width="2.2"/>${labelSvg(circle.label, center.x, center.y + 69)}`;
  }).join("");
  const segments = diagram.segments.map((segment) => {
    const [start, end] = lineEndpoints(diagram, pointMap, segment);
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const normal = Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2;
    return `${svgLine(start, end)}${labelSvg(segment.label, middle.x + Math.cos(normal) * 13, middle.y + Math.sin(normal) * 13)}`;
  }).join("");
  const angleMarks = diagram.angles.map((angle) => angleSvg(diagram, pointMap, angle)).join("");
  const pointMarks = points.map((point) =>
    `<circle cx="${point.x}" cy="${point.y}" r="3" fill="${STROKE}"/>`,
  ).join("");
  const intersections = diagram.figure === "intersecting_lines"
    ? `<circle cx="160" cy="105" r="2.8" fill="${STROKE}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(diagram.caption)}"><title>${escapeXml(diagram.caption)}</title>${background}${circles}${segments}${relationSvg(diagram, pointMap)}${angleMarks}${pointMarks}${intersections}${vertexLabels(points)}</svg>`;
}
