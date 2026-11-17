export type Subject = { id: string; label: string; shortLabel: string; icon: string; tint: string; description: string };

export const SUBJECTS: Subject[] = [
  { id: "math", label: "Matematică", shortLabel: "Mate", icon: "calculate", tint: "#8A72FF", description: "Ecuații, funcții și demonstrații" },
  { id: "physics", label: "Fizică", shortLabel: "Fizică", icon: "speed", tint: "#35B99B", description: "Forțe, energie și mișcare" },
  { id: "chemistry", label: "Chimie", shortLabel: "Chimie", icon: "science", tint: "#E7A94A", description: "Reacții și materia din jurul nostru" },
  { id: "romanian", label: "Limba română", shortLabel: "Română", icon: "menu-book", tint: "#D85E72", description: "Teme, concepte și lectură atentă" },
  { id: "biology", label: "Biologie", shortLabel: "Biologie", icon: "eco", tint: "#4E91D9", description: "Celule, sisteme și organisme" },
  { id: "computer-science", label: "Informatică", shortLabel: "Info", icon: "computer", tint: "#3976C5", description: "Algoritmi, programare și gândire computațională" },
];

export const DISPLAY_NAME_DEFAULT = "Elev";
