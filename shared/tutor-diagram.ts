import { z } from "zod";

const idSchema = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,11}$/);
const labelSchema = z.string().max(30);
const coordinateSchema = z.number().min(0).max(100);

export const geometryDiagramSchema = z.object({
  category: z.literal("geometry"),
  caption: z.string().min(1).max(100),
  schematic: z.boolean(),
  constraints: z.array(z.string().max(80)).max(16),
  figure: z.enum([
    "triangle",
    "square",
    "rectangle",
    "parallelogram",
    "polygon",
    "intersecting_lines",
    "circle",
    "freeform",
  ]),
  points: z.array(z.object({ id: idSchema, label: labelSchema }).strict()).min(1).max(16),
  segments: z.array(z.object({
    id: idSchema,
    from: idSchema,
    to: idSchema,
    label: labelSchema,
    lineType: z.enum(["segment", "line"]),
  }).strict()).max(28),
  angles: z.array(z.object({
    vertex: idSchema,
    ray1: idSchema,
    ray2: idSchema,
    label: labelSchema,
    marker: z.enum(["arc", "right"]),
  }).strict()).max(12),
  relations: z.array(z.object({
    type: z.enum(["parallel", "perpendicular", "equal_length"]),
    firstSegment: idSchema,
    secondSegment: idSchema,
  }).strict()).max(16),
  circles: z.array(z.object({
    id: idSchema,
    center: idSchema,
    label: labelSchema,
  }).strict()).max(4),
}).strict();

const chemistryElements = ["C", "N", "O", "F", "Cl", "Br", "I", "P", "S"] as const;

export const chemistryDiagramSchema = z.object({
  category: z.literal("chemistry"),
  caption: z.string().min(1).max(100),
  schematic: z.boolean(),
  constraints: z.array(z.string().max(80)).max(16),
  atoms: z.array(z.object({
    id: idSchema,
    element: z.enum(chemistryElements),
  }).strict()).min(1).max(40),
  bonds: z.array(z.object({
    from: idSchema,
    to: idSchema,
    order: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }).strict()).max(48),
}).strict();

const reactionSpeciesSchema = z.object({
  formula: z.string().regex(/^[A-Z][A-Za-z0-9()]*$/).max(24),
  coefficient: z.number().int().min(1).max(1000),
  state: z.enum(["s", "l", "g", "aq", ""]),
}).strict();

export const reactionDiagramSchema = z.object({
  category: z.literal("reaction"),
  caption: z.string().min(1).max(100),
  schematic: z.literal(true),
  reactants: z.array(reactionSpeciesSchema).min(1).max(4),
  products: z.array(reactionSpeciesSchema).min(1).max(4),
  conditions: z.string().max(100),
}).strict();

const drawingElementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), x1: coordinateSchema, y1: coordinateSchema, x2: coordinateSchema, y2: coordinateSchema, arrow: z.boolean(), label: labelSchema }).strict(),
  z.object({ type: z.literal("point"), x: coordinateSchema, y: coordinateSchema, label: labelSchema }).strict(),
  z.object({ type: z.literal("circle"), x: coordinateSchema, y: coordinateSchema, radius: z.number().min(1).max(40), label: labelSchema }).strict(),
  z.object({ type: z.literal("rectangle"), x: coordinateSchema, y: coordinateSchema, width: z.number().min(1).max(90), height: z.number().min(1).max(90), label: labelSchema }).strict(),
  z.object({ type: z.literal("polyline"), points: z.array(z.object({ x: coordinateSchema, y: coordinateSchema }).strict()).min(2).max(20), label: labelSchema }).strict(),
  z.object({ type: z.literal("text"), x: coordinateSchema, y: coordinateSchema, text: z.string().min(1).max(60) }).strict(),
]);

export const schematicDiagramSchema = z.object({
  category: z.literal("schematic"),
  caption: z.string().min(1).max(100),
  schematic: z.literal(true),
  steps: z.array(z.object({
    calculation: z.string().min(1).max(100),
    meaning: z.string().min(1).max(140),
  }).strict()).max(6),
  elements: z.array(drawingElementSchema).max(30),
}).strict();

export const tutorDiagramSchema = z.discriminatedUnion("category", [
  geometryDiagramSchema,
  chemistryDiagramSchema,
  reactionDiagramSchema,
  schematicDiagramSchema,
]);

export type GeometryDiagram = z.infer<typeof geometryDiagramSchema>;
export type ChemistryDiagram = z.infer<typeof chemistryDiagramSchema>;
export type ReactionDiagram = z.infer<typeof reactionDiagramSchema>;
export type SchematicDiagram = z.infer<typeof schematicDiagramSchema>;
export type TutorDiagram = z.infer<typeof tutorDiagramSchema>;

const atomValence: Record<(typeof chemistryElements)[number], number> = {
  C: 4,
  N: 3,
  O: 2,
  F: 1,
  Cl: 1,
  Br: 1,
  I: 1,
  P: 5,
  S: 6,
};

function connectedComponentCount(adjacency: Map<string, string[]>): number {
  const visited = new Set<string>();
  let count = 0;
  for (const id of adjacency.keys()) {
    if (visited.has(id)) continue;
    count += 1;
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(adjacency.get(current) ?? []));
    }
  }
  return count;
}

function polygonBoundaryExists(pointIds: string[], segments: GeometryDiagram["segments"]): boolean {
  if (pointIds.length < 3) return false;
  return pointIds.every((point, index) => {
    const next = pointIds[(index + 1) % pointIds.length];
    return segments.some((segment) => segment.lineType === "segment"
      && ((segment.from === point && segment.to === next) || (segment.from === next && segment.to === point)));
  });
}

const chemicalElements = new Set(
  "H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og".split(" "),
);

function parseChemicalFormula(formula: string): Map<string, number> | null {
  let index = 0;
  const parseGroup = (nested: boolean): Map<string, number> | null => {
    const counts = new Map<string, number>();
    let hasElement = false;
    while (index < formula.length && formula[index] !== ")") {
      if (formula[index] === "(") {
        index += 1;
        const group = parseGroup(true);
        if (!group || formula[index] !== ")") return null;
        index += 1;
        let digits = "";
        while (/\d/.test(formula[index] ?? "")) digits += formula[index++];
        const multiplier = digits ? Number(digits) : 1;
        if (!Number.isSafeInteger(multiplier) || multiplier < 1 || multiplier > 1000) return null;
        for (const [element, count] of group) {
          counts.set(element, (counts.get(element) ?? 0) + count * multiplier);
        }
        hasElement = true;
        continue;
      }

      const elementMatch = formula.slice(index).match(/^[A-Z][a-z]?/);
      if (!elementMatch || !chemicalElements.has(elementMatch[0])) return null;
      index += elementMatch[0].length;
      let digits = "";
      while (/\d/.test(formula[index] ?? "")) digits += formula[index++];
      const count = digits ? Number(digits) : 1;
      if (!Number.isSafeInteger(count) || count < 1 || count > 1000) return null;
      counts.set(elementMatch[0], (counts.get(elementMatch[0]) ?? 0) + count);
      hasElement = true;
    }
    return hasElement && (!nested || formula[index] === ")") ? counts : null;
  };

  const counts = parseGroup(false);
  return counts && index === formula.length ? counts : null;
}

function balancedReaction(diagram: ReactionDiagram): boolean {
  const totals = (species: ReactionDiagram["reactants"]) => {
    const result = new Map<string, number>();
    for (const item of species) {
      const formula = parseChemicalFormula(item.formula);
      if (!formula) return null;
      for (const [element, count] of formula) {
        result.set(element, (result.get(element) ?? 0) + count * item.coefficient);
      }
    }
    return result;
  };
  const reactants = totals(diagram.reactants);
  const products = totals(diagram.products);
  if (!reactants || !products || reactants.size !== products.size) return false;
  return [...reactants].every(([element, count]) => products.get(element) === count);
}

export function validateTutorDiagram(diagram: TutorDiagram): string | null {
  if (diagram.category === "reaction") {
    return balancedReaction(diagram)
      ? null
      : "Reaction formulas must be valid and atom-balanced.";
  }
  if (diagram.category === "chemistry") {
    const atoms = new Map(diagram.atoms.map((atom) => [atom.id, atom]));
    if (atoms.size !== diagram.atoms.length) return "Atom IDs must be unique.";
    const adjacency = new Map(diagram.atoms.map((atom) => [atom.id, [] as string[]]));
    const valences = new Map(diagram.atoms.map((atom) => [atom.id, 0]));
    const seenBonds = new Set<string>();
    for (const bond of diagram.bonds) {
      if (!atoms.has(bond.from) || !atoms.has(bond.to) || bond.from === bond.to) {
        return "Every bond must connect two different declared atoms.";
      }
      const key = [bond.from, bond.to].sort().join(":");
      if (seenBonds.has(key)) return "A pair of atoms cannot have duplicate bonds.";
      seenBonds.add(key);
      adjacency.get(bond.from)!.push(bond.to);
      adjacency.get(bond.to)!.push(bond.from);
      valences.set(bond.from, valences.get(bond.from)! + bond.order);
      valences.set(bond.to, valences.get(bond.to)! + bond.order);
    }
    for (const atom of diagram.atoms) {
      if (valences.get(atom.id)! > atomValence[atom.element]) {
        return `${atom.element} atom ${atom.id} exceeds its supported neutral valence.`;
      }
    }
    if (connectedComponentCount(adjacency) !== 1) return "A molecule must be a connected graph.";
    const isTree = diagram.bonds.length === diagram.atoms.length - 1;
    const isUnicyclic = diagram.bonds.length === diagram.atoms.length;
    if (!isTree && !isUnicyclic) return "Only acyclic molecules and molecules with one ring are supported.";
    return null;
  }

  if (diagram.category !== "geometry") return null;
  const points = new Map(diagram.points.map((point) => [point.id, point]));
  const segments = new Map(diagram.segments.map((segment) => [segment.id, segment]));
  const circles = new Map(diagram.circles.map((circle) => [circle.id, circle]));
  if (points.size !== diagram.points.length || segments.size !== diagram.segments.length || circles.size !== diagram.circles.length) {
    return "Point, segment, and circle IDs must be unique.";
  }
  const seenEdges = new Set<string>();
  for (const segment of diagram.segments) {
    if (!points.has(segment.from) || !points.has(segment.to) || segment.from === segment.to) {
      return "Every segment must connect two different declared points.";
    }
    const edge = [segment.from, segment.to].sort().join(":");
    if (seenEdges.has(edge)) return "A pair of points cannot have duplicate segments.";
    seenEdges.add(edge);
  }
  for (const angle of diagram.angles) {
    if (!points.has(angle.vertex) || !points.has(angle.ray1) || !points.has(angle.ray2)
      || angle.vertex === angle.ray1 || angle.vertex === angle.ray2 || angle.ray1 === angle.ray2) {
      return "Every angle must reference three different declared points.";
    }
    const hasRay = (point: string) => diagram.segments.some((segment) =>
      (segment.from === angle.vertex && segment.to === point)
      || (segment.to === angle.vertex && segment.from === point));
    if (!hasRay(angle.ray1) || !hasRay(angle.ray2)) return "Each angle ray must be a declared segment.";
  }
  for (const relation of diagram.relations) {
    if (!segments.has(relation.firstSegment) || !segments.has(relation.secondSegment)
      || relation.firstSegment === relation.secondSegment) {
      return "Each geometric relation must reference two different declared segments.";
    }
  }
  for (const circle of diagram.circles) {
    if (!points.has(circle.center)) return "Each circle center must reference a declared point.";
  }

  if (diagram.figure === "triangle" && (points.size !== 3 || !polygonBoundaryExists([...points.keys()], diagram.segments))) {
    return "A triangle needs three points connected by its three sides.";
  }
  if ((diagram.figure === "square" || diagram.figure === "rectangle" || diagram.figure === "parallelogram")
    && (points.size !== 4 || !polygonBoundaryExists([...points.keys()], diagram.segments))) {
    return "A quadrilateral needs four points connected by its four sides.";
  }
  if (diagram.figure === "intersecting_lines"
    && diagram.segments.filter((segment) => segment.lineType === "line").length < 2) {
    return "Intersecting-lines diagrams need two declared lines.";
  }
  if (diagram.figure === "circle" && circles.size === 0) return "A circle diagram needs a circle element.";
  if (diagram.segments.length === 0 && circles.size === 0) return "A geometry diagram needs a segment or a circle.";
  return null;
}
