import type { ChemistryDiagram } from "../shared/tutor-diagram";

type Point = { x: number; y: number };

const escapeXml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

function breadthFirst(start: string, adjacency: Map<string, string[]>): { farthest: string; previous: Map<string, string> } {
  const previous = new Map<string, string>();
  const distances = new Map([[start, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const neighbor of adjacency.get(current) ?? []) {
      if (distances.has(neighbor)) continue;
      previous.set(neighbor, current);
      distances.set(neighbor, distances.get(current)! + 1);
      queue.push(neighbor);
    }
  }
  const farthest = [...distances].sort((a, b) => b[1] - a[1])[0][0];
  return { farthest, previous };
}

function treeDiameter(adjacency: Map<string, string[]>): string[] {
  const first = breadthFirst(adjacency.keys().next().value as string, adjacency).farthest;
  const { farthest, previous } = breadthFirst(first, adjacency);
  const path = [farthest];
  while (path[path.length - 1] !== first) path.push(previous.get(path[path.length - 1])!);
  return path.reverse();
}

function angleDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function branchAngle(occupied: number[]): number {
  const candidates = Array.from({ length: 12 }, (_, index) => -Math.PI + (index * Math.PI) / 6);
  return candidates.map((angle) => ({
    angle,
    score: occupied.length
      ? occupied.reduce((total, used) => {
        const deviation = angleDistance(angle, used) - (2 * Math.PI) / 3;
        return total + deviation * deviation;
      }, 0)
      : 0,
  })).sort((a, b) => a.score - b.score || a.angle - b.angle)[0].angle;
}

function fitToCanvas(positions: Map<string, Point>): Map<string, Point> {
  const values = [...positions.values()];
  const minX = Math.min(...values.map((point) => point.x));
  const maxX = Math.max(...values.map((point) => point.x));
  const minY = Math.min(...values.map((point) => point.y));
  const maxY = Math.max(...values.map((point) => point.y));
  const scale = Math.min(250 / Math.max(maxX - minX, 1), 108 / Math.max(maxY - minY, 1));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return new Map([...positions].map(([id, point]) => [
    id,
    { x: 160 + (point.x - centerX) * scale, y: 91 + (point.y - centerY) * scale },
  ]));
}

export function layoutMolecule(diagram: ChemistryDiagram): Map<string, Point> {
  const adjacency = new Map(diagram.atoms.map((atom) => [atom.id, [] as string[]]));
  for (const bond of diagram.bonds) {
    adjacency.get(bond.from)!.push(bond.to);
    adjacency.get(bond.to)!.push(bond.from);
  }
  if (diagram.bonds.length === diagram.atoms.length && diagram.atoms.length > 2) {
    const cycle = [diagram.atoms[0].id];
    let previous: string | undefined;
    while (cycle.length < diagram.atoms.length) {
      const current = cycle[cycle.length - 1];
      const next = adjacency.get(current)!.find((id) => id !== previous);
      if (!next || next === cycle[0] || cycle.includes(next)) break;
      cycle.push(next);
      previous = current;
    }
    const radius = Math.min(68, 16 * diagram.atoms.length);
    if (cycle.length === diagram.atoms.length && adjacency.get(cycle[cycle.length - 1])!.includes(cycle[0])) {
      return new Map(cycle.map((id, index) => {
        const angle = -Math.PI / 2 + (index * 2 * Math.PI) / diagram.atoms.length;
        return [id, { x: 160 + Math.cos(angle) * radius, y: 91 + Math.sin(angle) * radius }];
      }));
    }
  }

  if (diagram.bonds.length === diagram.atoms.length && diagram.atoms.length > 2) {
    const remaining = new Set(adjacency.keys());
    const degrees = new Map([...adjacency].map(([id, neighbors]) => [id, neighbors.length]));
    const leaves = [...degrees].filter(([, degree]) => degree < 2).map(([id]) => id);
    for (let index = 0; index < leaves.length; index += 1) {
      const leaf = leaves[index];
      if (!remaining.delete(leaf)) continue;
      for (const neighbor of adjacency.get(leaf) ?? []) {
        if (!remaining.has(neighbor)) continue;
        const degree = degrees.get(neighbor)! - 1;
        degrees.set(neighbor, degree);
        if (degree === 1) leaves.push(neighbor);
      }
    }

    const start = remaining.values().next().value as string | undefined;
    if (start && remaining.size >= 3 && [...remaining].every((id) =>
      (adjacency.get(id) ?? []).filter((neighbor) => remaining.has(neighbor)).length === 2)) {
      const cycle = [start];
      let previous: string | undefined;
      while (cycle.length < remaining.size) {
        const current = cycle[cycle.length - 1];
        const next = adjacency.get(current)!.find((id) => remaining.has(id) && id !== previous);
        if (!next || next === start || cycle.includes(next)) break;
        cycle.push(next);
        previous = current;
      }
      if (cycle.length === remaining.size && adjacency.get(cycle[cycle.length - 1])!.includes(start)) {
        const radius = Math.min(68, 16 * cycle.length);
        const positions = new Map<string, Point>();
        cycle.forEach((id, index) => {
          const angle = -Math.PI / 2 + (index * 2 * Math.PI) / cycle.length;
          positions.set(id, { x: 160 + Math.cos(angle) * radius, y: 91 + Math.sin(angle) * radius });
        });

        const bondLength = 44;
        function growBranch(id: string, parent: string, direction: number): void {
          const parentPosition = positions.get(parent)!;
          positions.set(id, {
            x: parentPosition.x + Math.cos(direction) * bondLength,
            y: parentPosition.y + Math.sin(direction) * bondLength,
          });
          const currentPosition = positions.get(id)!;
          const occupied = [Math.atan2(parentPosition.y - currentPosition.y, parentPosition.x - currentPosition.x)];
          for (const child of adjacency.get(id) ?? []) {
            if (child === parent || remaining.has(child)) continue;
            const angle = branchAngle(occupied);
            occupied.push(angle);
            growBranch(child, id, angle);
          }
        }

        for (const id of cycle) {
          const origin = positions.get(id)!;
          const occupied = (adjacency.get(id) ?? [])
            .filter((neighbor) => remaining.has(neighbor))
            .map((neighbor) => positions.get(neighbor)!)
            .map((point) => Math.atan2(point.y - origin.y, point.x - origin.x));
          for (const branch of adjacency.get(id) ?? []) {
            if (remaining.has(branch)) continue;
            const angle = branchAngle(occupied);
            occupied.push(angle);
            growBranch(branch, id, angle);
          }
        }
        return fitToCanvas(positions);
      }
    }
  }

  const path = treeDiameter(adjacency);
  const positions = new Map<string, Point>();
  const bondLength = 44;
  path.forEach((id, index) => {
    if (index === 0) {
      positions.set(id, { x: 0, y: 0 });
      return;
    }
    const previous = positions.get(path[index - 1])!;
    const angle = index % 2 === 1 ? -Math.PI / 6 : Math.PI / 6;
    positions.set(id, { x: previous.x + Math.cos(angle) * bondLength, y: previous.y + Math.sin(angle) * bondLength });
  });
  const pathIds = new Set(path);

  function growBranch(id: string, parent: string, direction: number): void {
    const parentPosition = positions.get(parent)!;
    positions.set(id, {
      x: parentPosition.x + Math.cos(direction) * bondLength,
      y: parentPosition.y + Math.sin(direction) * bondLength,
    });
    const currentPosition = positions.get(id)!;
    const occupied = [Math.atan2(parentPosition.y - currentPosition.y, parentPosition.x - currentPosition.x)];
    const children = (adjacency.get(id) ?? []).filter((neighbor) => neighbor !== parent);
    for (const child of children) {
      const nextAngle = branchAngle(occupied);
      occupied.push(nextAngle);
      growBranch(child, id, nextAngle);
    }
  }

  for (const id of path) {
    const origin = positions.get(id)!;
    const onPathNeighbors = path
      .filter((other) => (adjacency.get(id) ?? []).includes(other))
      .map((other) => positions.get(other)!)
      .map((other) => Math.atan2(other.y - origin.y, other.x - origin.x));
    const branches = (adjacency.get(id) ?? []).filter((neighbor) => !pathIds.has(neighbor));
    for (const branch of branches) {
      const angle = branchAngle(onPathNeighbors);
      onPathNeighbors.push(angle);
      growBranch(branch, id, angle);
    }
  }

  return fitToCanvas(positions);
}

function bondSvg(start: Point, end: Point, order: number): string {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * 3;
  const ny = dx / length * 3;
  const line = (offset: number) => `<path d="M ${start.x + nx * offset} ${start.y + ny * offset} L ${end.x + nx * offset} ${end.y + ny * offset}" fill="none" stroke="#403875" stroke-width="2.1" stroke-linecap="round"/>`;
  if (order === 1) return line(0);
  if (order === 2) return `${line(-1)}${line(1)}`;
  return `${line(-1)}${line(0)}${line(1)}`;
}

export function chemistryDiagramSvg(diagram: ChemistryDiagram): string {
  const positions = layoutMolecule(diagram);
  const background = `<rect x="1" y="1" width="318" height="178" rx="14" fill="#FFFEFA" stroke="#E4E0D7"/>`;
  const bonds = diagram.bonds.map((bond) =>
    bondSvg(positions.get(bond.from)!, positions.get(bond.to)!, bond.order),
  ).join("");
  const visibleAtoms = diagram.atoms.filter((atom) => atom.element !== "C" || diagram.atoms.length === 1);
  const atoms = visibleAtoms.map((atom) => {
    const point = positions.get(atom.id)!;
    const width = atom.element.length > 1 ? 24 : 18;
    return `<text x="${point.x}" y="${point.y}" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-size="15" font-weight="700" fill="#292640" stroke="#FFFEFA" stroke-width="${width / 3}" paint-order="stroke">${escapeXml(atom.element)}</text>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" role="img" aria-label="${escapeXml(diagram.caption)}"><title>${escapeXml(diagram.caption)}</title>${background}${bonds}${atoms}</svg>`;
}
