export type TutorMode = "guided" | "hint" | "concept" | "example" | "check" | "practice" | "summary" | "direct";
export type TutorMessage = { id: string; role: "user" | "assistant"; text: string; mode?: TutorMode; createdAt: number; provider?: "live" | "demo"; model?: string };
export type TutorInput = { question: string; subject: string; mode: TutorMode; history: Array<Pick<TutorMessage, "role" | "text">> };
export type TutorReply = { text: string; provider: "live" | "demo"; notice?: string; model?: string };

export const TUTOR_MODES: Array<{ id: TutorMode; label: string; icon: string; tone: string }> = [
  { id: "hint", label: "Dă-mi un indiciu", icon: "lightbulb", tone: "#8A72FF" },
  { id: "concept", label: "Explică ideea", icon: "menu-book", tone: "#35B99B" },
  { id: "example", label: "Arată un exemplu", icon: "auto-awesome", tone: "#E7A94A" },
  { id: "check", label: "Verifică pasul meu", icon: "task-alt", tone: "#4E91D9" },
  { id: "practice", label: "Dă-mi exerciții", icon: "quiz", tone: "#D85E72" },
  { id: "summary", label: "Fă recapitularea", icon: "summarize", tone: "#8A72FF" },
];

export const GUIDED_SYSTEM_PROMPT = `Ești Elunariq, un ghid de învățare în limba română pentru elevi de liceu. Nu ești un motor de răspunsuri și nu dai rezultatul din prima. Lucrezi lent, clar și pe un singur pas odată. În modul ghidat: (1) spune ce înțelegi din problemă în maximum două propoziții, (2) identifică un singur concept sau o singură formulă relevantă, folosind LaTeX între delimitatori \\( ... \\) sau \\[ ... \\], (3) oferă un singur indiciu sau o întrebare, (4) cere elevului să răspundă înainte să continui. Nu dezvălui soluția completă decât dacă elevul cere explicit modul răspuns complet. Dacă răspunsul elevului este incorect, validează efortul, arată unde să verifice și pune o întrebare mai mică. La finalul unei lecții, rezumă conceptele și propune un mini-quiz. Nu folosi emoji. Nu folosi formule Unicode în loc de LaTeX. Nu pretinde că ai analizat un fișier dacă nu ai primit conținutul lui.`;

export function buildTutorPrompt(input: TutorInput): string {
  const modeLabel = input.mode === "direct" ? "răspuns complet cerut explicit" : `${input.mode}, un singur pas și o întrebare`;
  return `${GUIDED_SYSTEM_PROMPT}\n\nMateria: ${input.subject}\nMod: ${modeLabel}\nÎntrebarea elevului: ${input.question}`;
}

export async function getDemoReply(): Promise<TutorReply> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return {
    text: "Nu am putut obține un răspuns de la serviciul AI. Verifică dacă serviciul Render este activ și dacă cheile API sunt configurate.",
    provider: "demo",
    notice: "AI indisponibil · acesta nu este un răspuns generat de model.",
  };
}

export function createMessageId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }

export async function revealSlowly(text: string, onUpdate: (partial: string) => void): Promise<void> {
  const tokens = text.split(/(\s+)/);
  let partial = "";
  for (const token of tokens) {
    partial += token;
    onUpdate(partial);
    await new Promise((resolve) => setTimeout(resolve, token.trim() ? 34 : 12));
  }
}
