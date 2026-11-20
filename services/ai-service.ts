import type { TutorAnalysis } from "@/shared/tutor-analysis";
import type { TutorDiagram } from "@/shared/tutor-diagram";

export type TutorMode = "guided" | "hint" | "concept" | "example" | "check" | "practice" | "summary" | "direct";
export type TutorMessage = { id: string; role: "user" | "assistant"; text: string; mode?: TutorMode; createdAt: number; provider?: "live"; model?: string; title?: string; diagram?: TutorDiagram; imageUrl?: string; imageError?: string; analysis?: TutorAnalysis };
export type TutorInput = { question: string; subject: string; mode: TutorMode; history: Array<Pick<TutorMessage, "role" | "text">> };
export type TutorReply = { title: string; text: string; provider: "live"; model?: string; imageUrl?: string; imageError?: string };

export const TUTOR_MODES: Array<{ id: TutorMode; label: string; icon: string; tone: string }> = [
  { id: "hint", label: "Dă-mi un indiciu", icon: "lightbulb", tone: "#8A72FF" },
  { id: "concept", label: "Explică ideea", icon: "menu-book", tone: "#35B99B" },
  { id: "example", label: "Arată un exemplu", icon: "auto-awesome", tone: "#E7A94A" },
  { id: "check", label: "Verifică pasul meu", icon: "task-alt", tone: "#4E91D9" },
  { id: "practice", label: "Dă-mi exerciții", icon: "quiz", tone: "#D85E72" },
  { id: "summary", label: "Fă recapitularea", icon: "summarize", tone: "#8A72FF" },
];

export function buildQuickActionQuestion(
  action: TutorMode,
  draft: string,
  hasAttachment = false,
): string | null {
  const question = draft.trim();
  if (action === "check") {
    if (question) return `Verifică acest pas al meu: ${question}`;
    return hasAttachment ? "Verifică pasul meu din exercițiul atașat." : null;
  }

  const prompts: Partial<Record<TutorMode, string>> = {
    hint: "Dă-mi un indiciu pentru problema trimisă.",
    concept: "Explică-mi ideea principală, apoi pune-mi o întrebare.",
    example: "Arată-mi un exemplu asemănător, dar oprește-te înainte de rezultat.",
    practice: "Dă-mi un exercițiu asemănător pe care să îl încerc singur.",
    summary: "Fă o recapitulare și pune-mi un mini-quiz.",
  };
  const prompt = prompts[action] ?? "Ajută-mă cu următorul pas.";
  return question ? `${question}\n\n${prompt}` : prompt;
}

export function googleImagesSearchUrl(query: string): string {
  const url = new URL("https://www.google.com/search");
  url.searchParams.set("tbm", "isch");
  url.searchParams.set("q", query);
  return url.toString();
}

export const GUIDED_SYSTEM_PROMPT = `Ești Elunariq, un ghid de învățare în limba română pentru elevi de liceu. Nu ești un motor de răspunsuri și nu dai rezultatul din prima. Lucrezi clar și pe un singur pas odată. În modul ghidat: (1) spune ce înțelegi din problemă în maximum două propoziții, (2) identifică un singur concept sau o singură formulă relevantă, folosind exclusiv $ ... $ pentru formule inline și $$ ... $$ pentru formule pe bloc, (3) oferă un singur indiciu sau o întrebare, (4) cere elevului să răspundă înainte să continui. Respectă metoda cerută explicit de elev (inducție matematică, binomul lui Newton, calcul direct etc.) și nu o înlocui cu alta. Nu inventa variabile, parametri ori notații care nu apar în enunț. Păstrează răspunsurile concise, fără pași inutili. Pentru formule folosește sintaxă LaTeX validă cu backslash; nu folosi paranteze drepte izolate pe rânduri noi și nu lăsa linii goale excesive în formule. Nu dezvălui soluția completă decât dacă elevul cere explicit modul răspuns complet. Dacă răspunsul elevului este incorect, validează efortul, arată unde să verifice și pune o întrebare mai mică. La finalul unei lecții, rezumă conceptele și propune un mini-quiz. Nu folosi emoji. Nu folosi formule Unicode în loc de LaTeX. Nu pretinde că ai analizat un fișier dacă nu ai primit conținutul lui. Ești maleabil, drăguț, ascultător și săritor, dar nu dai răspunsurile din prima.`;

export function buildTutorPrompt(input: TutorInput): string {
  const modeLabel = input.mode === "direct" ? "răspuns complet cerut explicit" : `${input.mode}, un singur pas și o întrebare`;
  return `${GUIDED_SYSTEM_PROMPT}\n\nMateria: ${input.subject}\nMod: ${modeLabel}\nÎntrebarea elevului: ${input.question}`;
}

export function createMessageId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
