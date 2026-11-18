export type Subject = { id: string; label: string; shortLabel: string; icon: string; tint: string; description: string };

export const SUBJECTS: Subject[] = [
  { id: "math", label: "Matematică", shortLabel: "Mate", icon: "calculate", tint: "#8A72FF", description: "Ecuații, funcții și demonstrații" },
  { id: "physics", label: "Fizică", shortLabel: "Fizică", icon: "speed", tint: "#35B99B", description: "Forțe, energie și mișcare" },
  { id: "chemistry", label: "Chimie", shortLabel: "Chimie", icon: "science", tint: "#E7A94A", description: "Reacții și materia din jurul nostru" },
  { id: "romanian", label: "Limba română", shortLabel: "Română", icon: "menu-book", tint: "#D85E72", description: "Teme, concepte și lectură atentă" },
  { id: "biology", label: "Biologie", shortLabel: "Biologie", icon: "eco", tint: "#4E91D9", description: "Celule, sisteme și organisme" },
  { id: "computer-science", label: "Informatică", shortLabel: "Info", icon: "computer", tint: "#3976C5", description: "Algoritmi, programare și gândire computațională" },
  { id: "history", label: "Istorie", shortLabel: "Istorie", icon: "account-balance", tint: "#C87845", description: "Epoci, evenimente și surse istorice" },
  { id: "geography", label: "Geografie", shortLabel: "Geografie", icon: "public", tint: "#2F9B8C", description: "Hărți, regiuni și fenomene geografice" },
  { id: "english", label: "Limba engleză", shortLabel: "Engleză", icon: "translate", tint: "#6675D9", description: "Gramatică, vocabular și comunicare" },
];

export function recommendSubject(
  preferredSubjects: string[],
  activity: { subject: string; questionCount: number }[],
): Subject {
  const preferred = SUBJECTS.filter((subject) =>
    preferredSubjects.includes(subject.id),
  );
  const candidates = preferred.length ? preferred : SUBJECTS;
  return candidates.reduce((best, candidate) => {
    const candidateCount = activity.find((item) => item.subject === candidate.label)?.questionCount ?? 0;
    const bestCount = activity.find((item) => item.subject === best.label)?.questionCount ?? 0;
    return candidateCount < bestCount ? candidate : best;
  });
}

export const DISPLAY_NAME_DEFAULT = "Elev";
