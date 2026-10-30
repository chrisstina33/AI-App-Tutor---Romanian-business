import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";
import { publicProcedure, router } from "./_core/trpc";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
const systemPrompt = `Ești Elunariq, un tutor în limba română pentru elevi de liceu. Răspunde concret la întrebarea elevului și adaptează explicația la materia, enunț și modul cerut. Nu folosi răspunsuri-șablon și nu introduce ecuații sau formule decât dacă sunt relevante pentru problema elevului; nu folosi exemple generice precum a+b=c fără motiv.

Respectă modul cerut: în guided oferă un singur pas și o întrebare, fără soluția completă; în hint oferă un indiciu; în concept explică ideea cerută; în example oferă un exemplu asemănător; în check verifică pasul trimis; în practice creează un exercițiu; în summary recapitulează și propune un mini-quiz; în direct răspunde complet și clar.

Folosește formule LaTeX doar când ajută la explicarea unei probleme matematice. Dacă informația lipsește, cere detaliul necesar în loc să inventezi un exemplu. Nu folosi emoji și nu pretinde că ai analizat fișiere fără conținut procesat.`;

function modelFor(input: { mode: (typeof tutorModes)[number]; question: string }) {
  if (input.mode === "direct" && input.question.length > 1800) return { model: "gpt-5.5", tier: "premium" as const };
  if (input.mode === "direct" || input.question.length > 900) return { model: "gpt-5", tier: "extended" as const };
  return { model: "gpt-5-mini", tier: "routine" as const };
}

const contentToText = (content: unknown): string => {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) return content.map((part) => (part && typeof part === "object" && "text" in part ? String((part as { text?: unknown }).text ?? "") : "")).join("\n").trim();
  return "";
};

export const assistantRouter = router({
  chat: publicProcedure.input(z.object({ subject: z.string().min(1).max(80), mode: z.enum(tutorModes), question: z.string().min(1).max(4000), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20) })).mutation(async ({ input }) => {
    const selected = modelFor(input);
    const history: Message[] = input.messages.map((message) => ({ role: message.role, content: message.text }));
    const result = await invokeLLM({
      model: selected.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: `Materia: ${input.subject}\nMod: ${input.mode}\nÎntrebarea elevului: ${input.question}` },
      ],
      maxCompletionTokens: selected.tier === "premium" ? 1400 : selected.tier === "extended" ? 1000 : 700,
      reasoning: selected.tier === "routine" ? { effort: "minimal" } : { effort: selected.tier === "premium" ? "high" : "medium" },
    });
    const text = contentToText(result.choices?.[0]?.message?.content);
    if (!text) throw new Error("Ghidul nu a returnat un răspuns.");
    return { provider: "live" as const, text, model: selected.model, tier: selected.tier };
  }),
});