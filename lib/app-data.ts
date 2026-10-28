export type Subject = { id: string; label: string; shortLabel: string; icon: string; tint: string; description: string };
export type Lesson = { id: string; title: string; subject: string; duration: string; progress: number; updatedAt: string; accent: string };

export const SUBJECTS: Subject[] = [
  { id: "math", label: "Matematică", shortLabel: "Mate", icon: "calculate", tint: "#8A72FF", description: "Ecuații, funcții și demonstrații" },
  { id: "physics", label: "Fizică", shortLabel: "Fizică", icon: "speed", tint: "#35B99B", description: "Forțe, energie și mișcare" },
  { id: "chemistry", label: "Chimie", shortLabel: "Chimie", icon: "science", tint: "#E7A94A", description: "Reacții și materia din jurul nostru" },
  { id: "romanian", label: "Limba română", shortLabel: "Română", icon: "menu-book", tint: "#D85E72", description: "Teme, concepte și lectură atentă" },
  { id: "biology", label: "Biologie", shortLabel: "Biologie", icon: "eco", tint: "#4E91D9", description: "Celule, sisteme și organisme" },
];

export const DEMO_LESSONS: Lesson[] = [
  { id: "quadratic-functions", title: "Funcția de gradul al II-lea: vârful parabolei", subject: "Matematică", duration: "18 min", progress: 0.72, updatedAt: "Astăzi", accent: "#8A72FF" },
  { id: "energy-work", title: "Lucrul mecanic și energia cinetică", subject: "Fizică", duration: "24 min", progress: 0.46, updatedAt: "Ieri", accent: "#35B99B" },
  { id: "ion-bonds", title: "De ce se formează legăturile ionice", subject: "Chimie", duration: "12 min", progress: 0.31, updatedAt: "Luni", accent: "#E7A94A" },
];

export const RECOMMENDATIONS = [
  { id: "r1", eyebrow: "URMĂTORUL PAS", title: "Completează exemplul cu vârful parabolei", detail: "Ești aproape de finalul lecției de matematică.", icon: "north-east", color: "#8A72FF" },
  { id: "r2", eyebrow: "RECAPITULARE RAPIDĂ", title: "Trei forțe de reținut", detail: "O recapitulare de fizică în șase minute.", icon: "bolt", color: "#35B99B" },
  { id: "r3", eyebrow: "LIMBA ROMÂNĂ", title: "Naratorul necreditabil", detail: "Un concept și două exemple de lectură.", icon: "auto-stories", color: "#D85E72" },
];

export const DAILY_GOAL = { completed: 28, target: 40 };
export const DISPLAY_NAME_DEFAULT = "Elev";
