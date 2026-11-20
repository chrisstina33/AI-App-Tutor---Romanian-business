import { afterEach, describe, expect, it, vi } from "vitest";
import { chemistryDiagramSvg, layoutMolecule } from "../lib/chemistry-renderer";
import { diagramSvg } from "../lib/diagrams";
import { geometryDiagramSvg, layoutGeometryPoints } from "../lib/geometry-renderer";
import { tutorDrawingSvg } from "../lib/tutor-drawing";
import { validateTutorDiagram, type ChemistryDiagram, type GeometryDiagram, type ReactionDiagram } from "../shared/tutor-diagram";
import { diagramForTutorSubject, parseTutorResponse, tutorResponseJsonSchema } from "../server/ai";

afterEach(() => vi.restoreAllMocks());

const triangle: GeometryDiagram = {
  category: "geometry",
  caption: "Triunghiul ABC",
  schematic: true,
  constraints: [],
  figure: "triangle",
  points: [{ id: "A", label: "A" }, { id: "B", label: "B" }, { id: "C", label: "C" }],
  segments: [
    { id: "AB", from: "A", to: "B", label: "", lineType: "segment" },
    { id: "BC", from: "B", to: "C", label: "", lineType: "segment" },
    { id: "CA", from: "C", to: "A", label: "", lineType: "segment" },
  ],
  angles: [{ vertex: "C", ray1: "B", ray2: "A", label: "", marker: "arc" }],
  relations: [],
  circles: [],
};

const atoms = (ids: string[]) => ids.map((id) => ({ id, element: "C" as const }));
const bond = (from: string, to: string, order: 1 | 2 | 3 = 1) => ({ from, to, order });

describe("semantic geometry diagrams", () => {
  it("lays out and marks angle C in triangle ABC without model coordinates", () => {
    expect(validateTutorDiagram(triangle)).toBeNull();
    const svg = geometryDiagramSvg(triangle);
    expect(svg).toContain('aria-label="Triunghiul ABC"');
    expect(svg).toContain(" A 19 19 0 0 ");
    expect(svg).toContain(">C</text>");
  });

  it("lays out the two equal sides as equal lengths", () => {
    const isosceles: GeometryDiagram = {
      ...triangle,
      angles: [],
      relations: [{ type: "equal_length", firstSegment: "AB", secondSegment: "CA" }],
    };
    const points = new Map(layoutGeometryPoints(isosceles).map((point) => [point.id, point]));
    const a = points.get("A")!;
    const b = points.get("B")!;
    const c = points.get("C")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(a.x - c.x, a.y - c.y));
    expect((geometryDiagramSvg(isosceles).match(/stroke="#A85C43"/g) ?? []).length).toBe(2);
  });

  it("uses segment connectivity rather than point-array order and honors a right angle", () => {
    const reordered: GeometryDiagram = { ...triangle, points: [triangle.points[2], triangle.points[0], triangle.points[1]] };
    const positions = new Map(layoutGeometryPoints(reordered).map((point) => [point.id, point]));
    expect(positions.get("A")!.x).not.toBe(positions.get("B")!.x);
    expect(positions.get("A")!.y).toBe(positions.get("B")!.y);

    const rightTriangle: GeometryDiagram = {
      ...triangle,
      angles: [{ vertex: "C", ray1: "A", ray2: "B", label: "", marker: "right" }],
    };
    const rightPositions = new Map(layoutGeometryPoints(rightTriangle).map((point) => [point.id, point]));
    const c = rightPositions.get("C")!;
    const a = rightPositions.get("A")!;
    const b = rightPositions.get("B")!;
    expect((a.x - c.x) * (b.x - c.x) + (a.y - c.y) * (b.y - c.y)).toBeCloseTo(0);
  });

  it("draws two intersecting lines and relation markers for parallel and perpendicular segments", () => {
    const intersecting: GeometryDiagram = {
      category: "geometry",
      caption: "Dreptele AB și CD",
      schematic: true,
      constraints: [],
      figure: "intersecting_lines",
      points: ["A", "B", "C", "D", "O"].map((id) => ({ id, label: id })),
      segments: [
        { id: "AB", from: "A", to: "B", label: "", lineType: "line" },
        { id: "CD", from: "C", to: "D", label: "", lineType: "line" },
      ],
      angles: [],
      relations: [{ type: "perpendicular", firstSegment: "AB", secondSegment: "CD" }],
      circles: [],
    };
    expect(validateTutorDiagram(intersecting)).toBeNull();
    const intersectingSvg = geometryDiagramSvg(intersecting);
    expect(intersectingSvg).toContain('cx="160" cy="105"');
    expect(intersectingSvg).toContain('L 173.6602540378444 108.66025403784441');
    const linePoints = new Map(layoutGeometryPoints(intersecting).map((point) => [point.id, point]));
    const firstLine = [linePoints.get("B")!, linePoints.get("A")!];
    const secondLine = [linePoints.get("D")!, linePoints.get("C")!];
    expect((firstLine[0].x - firstLine[1].x) * (secondLine[0].x - secondLine[1].x)
      + (firstLine[0].y - firstLine[1].y) * (secondLine[0].y - secondLine[1].y)).toBeCloseTo(0);

    const rectangle: GeometryDiagram = {
      ...triangle,
      figure: "rectangle",
      points: ["A", "B", "C", "D"].map((id) => ({ id, label: id })),
      segments: [
        { id: "AB", from: "A", to: "B", label: "", lineType: "segment" },
        { id: "BC", from: "B", to: "C", label: "", lineType: "segment" },
        { id: "CD", from: "C", to: "D", label: "", lineType: "segment" },
        { id: "DA", from: "D", to: "A", label: "", lineType: "segment" },
      ],
      angles: [],
      relations: [
        { type: "parallel", firstSegment: "AB", secondSegment: "CD" },
        { type: "perpendicular", firstSegment: "AB", secondSegment: "BC" },
      ],
    };
    expect(validateTutorDiagram(rectangle)).toBeNull();
    const svg = diagramSvg(rectangle);
    expect(svg).toContain('viewBox="0 0 320 210"');
    expect((svg.match(/stroke="#A85C43"/g) ?? []).length).toBeGreaterThanOrEqual(5);
    const rectanglePoints = new Map(layoutGeometryPoints(rectangle).map((point) => [point.id, point]));
    const ab = [rectanglePoints.get("B")!, rectanglePoints.get("A")!];
    const cd = [rectanglePoints.get("D")!, rectanglePoints.get("C")!];
    expect(ab[0].y - ab[1].y).toBeCloseTo(cd[0].y - cd[1].y);
    const bc = [rectanglePoints.get("C")!, rectanglePoints.get("B")!];
    expect((ab[0].x - ab[1].x) * (bc[0].x - bc[1].x)
      + (ab[0].y - ab[1].y) * (bc[0].y - bc[1].y)).toBeCloseTo(0);
  });

  it("rejects a quadrilateral whose segments do not form a closed boundary", () => {
    const incomplete: GeometryDiagram = {
      category: "geometry",
      caption: "Patru puncte",
      schematic: true,
      constraints: [],
      figure: "rectangle",
      points: ["A", "B", "C", "D"].map((id) => ({ id, label: id })),
      segments: [
        { id: "AB", from: "A", to: "B", label: "", lineType: "segment" },
        { id: "CD", from: "C", to: "D", label: "", lineType: "segment" },
        { id: "AC", from: "A", to: "C", label: "", lineType: "segment" },
      ],
      angles: [],
      relations: [],
      circles: [],
    };
    expect(validateTutorDiagram(incomplete)).toContain("four sides");
  });

  it("draws a parallelogram with four sides and marks both opposite pairs parallel", () => {
    const parallelogram: GeometryDiagram = {
      category: "geometry",
      caption: "Paralelogramul ABCD",
      schematic: true,
      constraints: [],
      figure: "parallelogram",
      points: ["A", "B", "C", "D"].map((id) => ({ id, label: id })),
      segments: [
        { id: "AB", from: "A", to: "B", label: "", lineType: "segment" },
        { id: "BC", from: "B", to: "C", label: "", lineType: "segment" },
        { id: "CD", from: "C", to: "D", label: "", lineType: "segment" },
        { id: "DA", from: "D", to: "A", label: "", lineType: "segment" },
      ],
      angles: [],
      relations: [],
      circles: [],
    };

    expect(validateTutorDiagram(parallelogram)).toBeNull();
    const positions = new Map(layoutGeometryPoints(parallelogram).map((point) => [point.id, point]));
    const a = positions.get("A")!;
    const b = positions.get("B")!;
    const c = positions.get("C")!;
    const d = positions.get("D")!;
    expect((b.y - a.y) * (d.x - c.x) - (b.x - a.x) * (d.y - c.y)).toBeCloseTo(0);
    expect((c.y - b.y) * (a.x - d.x) - (c.x - b.x) * (a.y - d.y)).toBeCloseTo(0);
    const svg = geometryDiagramSvg(parallelogram);
    expect(svg).toContain('aria-label="Paralelogramul ABCD"');
    expect((svg.match(/stroke="#A85C43"/g) ?? [])).toHaveLength(8);
  });

  it("renders a circle with a center point and circumference", () => {
    const circle: GeometryDiagram = {
      category: "geometry",
      caption: "Cercul cu centrul O",
      schematic: true,
      constraints: [],
      figure: "circle",
      points: [{ id: "O", label: "O" }, { id: "A", label: "A" }],
      segments: [{ id: "OA", from: "O", to: "A", label: "", lineType: "segment" }],
      angles: [],
      relations: [],
      circles: [{ id: "c1", center: "O", label: "cerc" }],
    };
    const svg = geometryDiagramSvg(circle);
    expect(validateTutorDiagram(circle)).toBeNull();
    expect(svg).toContain('<circle cx="160" cy="105" r="55"');
    expect(svg).toContain(">O</text>");
  });
});

describe("molecular graph diagrams", () => {
  const examples: Array<{ name: string; diagram: ChemistryDiagram; bonds: number }> = [
    {
      name: "propane",
      diagram: { category: "chemistry", caption: "Propane", schematic: false, constraints: ["C3H8"], atoms: atoms(["C1", "C2", "C3"]), bonds: [bond("C1", "C2"), bond("C2", "C3")] },
      bonds: 2,
    },
    {
      name: "1,3-dimethylpropane",
      diagram: { category: "chemistry", caption: "1,3-dimetilpropan", schematic: false, constraints: ["C5H12"], atoms: atoms(["P1", "P2", "P3", "M1", "M3"]), bonds: [bond("P1", "P2"), bond("P2", "P3"), bond("P1", "M1"), bond("P3", "M3")] },
      bonds: 4,
    },
    {
      name: "a double bond",
      diagram: { category: "chemistry", caption: "Etenă", schematic: false, constraints: ["C2H4"], atoms: atoms(["C1", "C2"]), bonds: [bond("C1", "C2", 2)] },
      bonds: 1,
    },
    {
      name: "a branched carbon chain",
      diagram: { category: "chemistry", caption: "Lanț carbonic ramificat", schematic: false, constraints: [], atoms: atoms(["C1", "C2", "C3", "C4", "C5"]), bonds: [bond("C1", "C2"), bond("C2", "C3"), bond("C2", "C4"), bond("C4", "C5")] },
      bonds: 4,
    },
  ];

  it.each(examples)("preserves connectivity and draws $name deterministically", ({ diagram, bonds: bondCount }) => {
    expect(validateTutorDiagram(diagram)).toBeNull();
    const svg = chemistryDiagramSvg(diagram);
    expect(svg).toContain(`aria-label="${diagram.caption}"`);
    expect((svg.match(/stroke="#403875"/g) ?? []).length).toBeGreaterThanOrEqual(bondCount);
    const positions = [...layoutMolecule(diagram).values()];
    expect(new Set(positions.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBe(diagram.atoms.length);
    expect(positions.every(({ x, y }) => x > 20 && x < 300 && y > 20 && y < 160)).toBe(true);
  });

  describe("reaction and physics diagrams", () => {
    it("renders a balanced stoichiometric equation and rejects an unbalanced one", () => {
      const reaction: ReactionDiagram = {
        category: "reaction",
        caption: "Sinteza apei",
        schematic: true,
        reactants: [
          { formula: "H2", coefficient: 2, state: "g" },
          { formula: "O2", coefficient: 1, state: "g" },
        ],
        products: [{ formula: "H2O", coefficient: 2, state: "l" }],
        conditions: "",
      };

      expect(validateTutorDiagram(reaction)).toBeNull();
      const svg = diagramSvg(reaction);
      expect(svg).toContain(">2</tspan>H<tspan");
      expect(svg).toContain("M 316 66 L 404 66");
      expect(validateTutorDiagram({ ...reaction, products: [{ ...reaction.products[0], coefficient: 1 }] }))
        .toContain("atom-balanced");
    });

    it("renders a vector arrow for a physics schematic", () => {
      const svg = tutorDrawingSvg({
        category: "schematic",
        caption: "Vectorul forței",
        schematic: true,
        steps: [],
        elements: [
          { type: "line", x1: 10, y1: 50, x2: 80, y2: 50, arrow: true, label: "F" },
        ],
      });

      expect(svg).toContain("M 46.4 100 L 245.2 100");
      expect(svg).toContain(">F</text>");
    });
  });

  it("uses textbook bond angles for straight and branched carbon skeletons", () => {
    const angleAt = (diagram: ChemistryDiagram, center: string, first: string, second: string) => {
      const positions = layoutMolecule(diagram);
      const origin = positions.get(center)!;
      const a = positions.get(first)!;
      const b = positions.get(second)!;
      const ax = a.x - origin.x;
      const ay = a.y - origin.y;
      const bx = b.x - origin.x;
      const by = b.y - origin.y;
      return Math.acos((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by))) * (180 / Math.PI);
    };

    expect(angleAt(examples[0].diagram, "C2", "C1", "C3")).toBeCloseTo(120, 0);
    const branched = examples[3].diagram;
    for (const [first, second] of [["C1", "C3"], ["C1", "C4"], ["C3", "C4"]] as const) {
      expect(angleAt(branched, "C2", first, second)).toBeCloseTo(120, 0);
    }
  });

  it("lays out each atom in a simple ring", () => {
    const ring: ChemistryDiagram = {
      category: "chemistry",
      caption: "Ciclopropan",
      schematic: true,
      constraints: [],
      atoms: atoms(["C1", "C2", "C3"]),
      bonds: [bond("C1", "C2"), bond("C2", "C3"), bond("C3", "C1")],
    };
    const positions = layoutMolecule(ring);
    expect(positions.size).toBe(3);
    expect(new Set([...positions.values()].map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBe(3);
    expect([...positions.values()].every(({ x, y }) => x > 20 && x < 300 && y > 20 && y < 160)).toBe(true);
  });

  it("lays out a ring with a carbon side chain", () => {
    const ringWithBranch: ChemistryDiagram = {
      category: "chemistry",
      caption: "Metilciclohexan",
      schematic: true,
      constraints: [],
      atoms: atoms(["C1", "C2", "C3", "C4", "C5", "C6", "M1"]),
      bonds: [
        bond("C1", "C2"), bond("C2", "C3"), bond("C3", "C4"),
        bond("C4", "C5"), bond("C5", "C6"), bond("C6", "C1"),
        bond("C2", "M1"),
      ],
    };
    expect(validateTutorDiagram(ringWithBranch)).toBeNull();
    const positions = layoutMolecule(ringWithBranch);
    expect(positions.size).toBe(7);
    expect(new Set([...positions.values()].map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)).size).toBe(7);
    expect([...positions.values()].every(({ x, y }) => x > 20 && x < 300 && y > 20 && y < 160)).toBe(true);
    expect(chemistryDiagramSvg(ringWithBranch)).toContain('aria-label="Metilciclohexan"');
  });

  it("supports phosphorus and sulfur atoms in organic structures", () => {
    const sulfide: ChemistryDiagram = {
      category: "chemistry",
      caption: "Sulfidă organică",
      schematic: false,
      constraints: [],
      atoms: [
        { id: "C1", element: "C" },
        { id: "S1", element: "S" },
        { id: "C2", element: "C" },
        { id: "P1", element: "P" },
      ],
      bonds: [bond("C1", "S1"), bond("S1", "C2"), bond("C2", "P1")],
    };
    expect(validateTutorDiagram(sulfide)).toBeNull();
    expect(chemistryDiagramSvg(sulfide)).toContain(">S</text>");
  });

  it("rejects over-valent and disconnected molecular graphs", () => {
    const invalidValence: ChemistryDiagram = {
      category: "chemistry",
      caption: "Invalid",
      schematic: false,
      constraints: [],
      atoms: atoms(["C", "N1", "N2", "N3", "N4", "N5"]),
      bonds: ["N1", "N2", "N3", "N4", "N5"].map((id) => bond("C", id)),
    };
    expect(validateTutorDiagram(invalidValence)).toMatch(/valence/);
    expect(validateTutorDiagram({
      category: "chemistry",
      caption: "Disconnected",
      schematic: false,
      constraints: [],
      atoms: atoms(["C1", "C2"]),
      bonds: [],
    })).toMatch(/connected graph/);
  });
});

describe("structured tutor responses", () => {
  it("converts Zod discriminated unions to the provider-supported anyOf keyword", () => {
    const hasOneOf = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(hasOneOf);
      if (!value || typeof value !== "object") return false;
      return Object.entries(value).some(([key, child]) => key === "oneOf" || hasOneOf(child));
    };
    expect(hasOneOf(tutorResponseJsonSchema)).toBe(false);
    expect(JSON.stringify(tutorResponseJsonSchema)).toContain('"anyOf"');
  });

  it("reports malformed or incomplete JSON instead of treating it as prose", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => parseTutorResponse("not json")).toThrow(/răspuns structurat invalid/);
    expect(() => parseTutorResponse(JSON.stringify({ text: "Lipsesc câmpuri." }))).toThrow(/răspuns incomplet/);
  });

  it("omits a chemically invalid diagram but keeps the tutoring answer", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = parseTutorResponse(JSON.stringify({
      title: "Legăturile atomului de carbon",
      text: "Verifică numărul legăturilor carbonului.",
      analysis: { subject: "Chimie", schoolLevel: "liceu", difficulty: "mediu", confidence: 0.9, mastery: "unknown" },
      imagePrompt: null,
      diagram: {
        category: "chemistry",
        caption: "Structură",
        schematic: true,
        constraints: [],
        atoms: atoms(["C", "N1", "N2", "N3", "N4", "N5"]),
        bonds: ["N1", "N2", "N3", "N4", "N5"].map((id) => bond("C", id)),
      },
    }));
    expect(response.text).toBe("Verifică numărul legăturilor carbonului.");
    expect(response.diagram).toBeNull();
  });

  it("does not display mathematical geometry as a physics diagram", () => {
    expect(diagramForTutorSubject("Fizică", triangle)).toBeUndefined();
    expect(diagramForTutorSubject("Fizică", {
      category: "schematic",
      caption: "Forță",
      schematic: true,
      steps: [],
      elements: [],
    })?.category).toBe("schematic");
  });
});
