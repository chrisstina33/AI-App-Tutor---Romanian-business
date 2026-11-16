import { afterEach, describe, expect, it, vi } from "vitest";
import { chemistryDiagramSvg, layoutMolecule } from "../lib/chemistry-renderer";
import { diagramSvg } from "../lib/diagrams";
import { geometryDiagramSvg, layoutGeometryPoints } from "../lib/geometry-renderer";
import { validateTutorDiagram, type ChemistryDiagram, type GeometryDiagram } from "../shared/tutor-diagram";
import { parseTutorResponse } from "../server/ai";

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
      relations: [{ type: "equal_length", firstSegment: "AB", secondSegment: "AC" }],
    };
    const points = new Map(layoutGeometryPoints(isosceles).map((point) => [point.id, point]));
    const a = points.get("A")!;
    const b = points.get("B")!;
    const c = points.get("C")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(Math.hypot(a.x - c.x, a.y - c.y));
    expect((geometryDiagramSvg(isosceles).match(/stroke="#A85C43"/g) ?? []).length).toBe(2);
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
    expect(geometryDiagramSvg(intersecting)).toContain('cx="160" cy="105"');

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
  it("reports malformed or incomplete JSON instead of treating it as prose", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => parseTutorResponse("not json")).toThrow(/răspuns structurat invalid/);
    expect(() => parseTutorResponse(JSON.stringify({ text: "Lipsesc câmpuri." }))).toThrow(/răspuns incomplet/);
  });

  it("omits a chemically invalid diagram but keeps the tutoring answer", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = parseTutorResponse(JSON.stringify({
      text: "Verifică numărul legăturilor carbonului.",
      analysis: { subject: "Chimie", schoolLevel: "liceu", difficulty: "mediu", confidence: 0.9, mastery: "unknown" },
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
});
