export type TutorAnalysis = {
  subject: "Matematică" | "Fizică" | "Chimie" | "Limba română" | "Biologie" | "Informatică" | "Istorie" | "Geografie" | "Limba engleză" | "necunoscut";
  schoolLevel: "gimnaziu" | "liceu" | "olimpiada" | "necunoscut";
  difficulty: "ușor" | "mediu" | "dificil" | "necunoscut";
  confidence: number;
  mastery: "demonstrated" | "not_yet" | "unknown";
};
