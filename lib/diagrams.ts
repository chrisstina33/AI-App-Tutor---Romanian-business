import type { TutorDiagram } from "../shared/tutor-diagram";
import { chemistryDiagramSvg } from "./chemistry-renderer";
import { geometryDiagramSvg } from "./geometry-renderer";
import { reactionDiagramSvg } from "./reaction-renderer";
import { tutorDrawingSvg } from "./tutor-drawing";

export function diagramSvg(diagram: TutorDiagram): string {
  if (diagram.category === "geometry") return geometryDiagramSvg(diagram);
  if (diagram.category === "chemistry") return chemistryDiagramSvg(diagram);
  if (diagram.category === "reaction") return reactionDiagramSvg(diagram);
  return tutorDrawingSvg(diagram);
}
