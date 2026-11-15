export type TutorAnalysis = {
  subject: "Matematică" | "Fizică" | "Chimie" | "Limba română" | "Biologie" | "necunoscut";
  schoolLevel: "gimnaziu" | "liceu" | "necunoscut";
  difficulty: "ușor" | "mediu" | "dificil" | "necunoscut";
  confidence: number;
  mastery: "demonstrated" | "not_yet" | "unknown";
};
