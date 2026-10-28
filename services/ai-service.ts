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

const DEMO_RESPONSES: Record<TutorMode, string> = {
  guided: "## Primul pas\n\nVreau să înțeleg ce ai observat deja. În ecuația ta, necunoscuta este izolată sau mai există operații în jurul ei?\n\n**Întrebarea pentru tine:** care este operația cea mai îndepărtată de necunoscută?",
  hint: "## Indiciu\n\nPrivește operația cea mai îndepărtată de necunoscută. Încearcă operația inversă pe ambele părți.\n\n**Întrebarea mea:** ce obții după primul pas?",
  concept: "## Ideea\n\nO ecuație rămâne echilibrată dacă aplici aceeași operație pe ambele părți. Pentru a anula adunarea folosim scăderea, iar pentru a anula înmulțirea folosim împărțirea.\n\nÎn notație LaTeX: \\(a+b=c \\Rightarrow a=c-b\\).\n\n**Poți spune ce operație inversă apare în problema ta?**",
  example: "## Exemplu asemănător\n\nPentru \\(3x+7=22\\), primul pas este să scădem 7 din ambele părți: \\(3x=15\\).\n\nMă opresc aici ca să lucrezi tu mai departe. **Ce operație urmează pentru a rămâne doar cu \\(x\\)?**",
  check: "## Verificăm pasul\n\nNu pot confirma încă fără să văd pasul tău. Scrie exact transformarea pe care ai făcut-o, nu doar rezultatul.\n\n**Ce ai obținut după primul calcul?**",
  practice: "## Exercițiu pentru tine\n\nÎncearcă: \\(2x+5=17\\). Nu căuta rezultatul.\n\n**Primul pas:** ce trebuie eliminat mai întâi și de ce?",
  summary: "## Recapitulare\n\nAm folosit operații inverse, am păstrat echilibrul ecuației și am verificat rezultatul prin înlocuire.\n\n**Mini-quiz:** ce operație inversează înmulțirea cu 4? Răspunde înainte să îți arăt următoarea idee.",
  direct: "## Răspuns complet\n\nÎți arăt soluția completă doar pentru că ai cerut-o. Voi explica motivul fiecărui pas, apoi îți dau un exercițiu aproape identic pe care să îl rezolvi singur.\n\nPentru problema exactă, trimite enunțul complet.",
};

export function buildTutorPrompt(input: TutorInput): string {
  const modeLabel = input.mode === "direct" ? "răspuns complet cerut explicit" : `${input.mode}, un singur pas și o întrebare`;
  return `${GUIDED_SYSTEM_PROMPT}\n\nMateria: ${input.subject}\nMod: ${modeLabel}\nÎntrebarea elevului: ${input.question}`;
}

export async function getDemoReply(input: TutorInput): Promise<TutorReply> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return { text: input.question.trim() ? DEMO_RESPONSES[input.mode] : "Scrie enunțul exact și îți voi pune prima întrebare.", provider: "demo", notice: "Mod demonstrativ · răspunsurile live se activează prin serviciul AI configurat.", model: "gpt-5-mini" };
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
