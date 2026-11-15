export type TutorDrawingElement =
  | { type: "line"; x1: number; y1: number; x2: number; y2: number; arrow?: boolean; label?: string }
  | { type: "point"; x: number; y: number; label?: string }
  | { type: "circle"; x: number; y: number; radius: number; label?: string }
  | { type: "rectangle"; x: number; y: number; width: number; height: number; label?: string }
  | { type: "polyline"; points: Array<{ x: number; y: number }>; label?: string }
  | { type: "text"; x: number; y: number; text: string };

export type TutorDrawing = {
  caption: string;
  steps: Array<{ calculation: string; meaning: string }>;
  elements: TutorDrawingElement[];
};
