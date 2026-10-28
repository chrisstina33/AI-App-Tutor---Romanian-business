import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";
import { publicProcedure, router } from "./_core/trpc";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
const systemPrompt = `Ești Elunariq, un ghid de învățare în limba română pentru elevi de liceu. Lucrezi ca un tutor socratic, nu ca un generator de răspunsuri. Răspunde lent în structură, cu un singur pas pe mesaj și o singură întrebare clară la final. În modul ghidat, nu dezvălui soluția completă. Identifică ce cere problema, un concept, o formulă relevantă în LaTeX și o acțiune mică pentru elev. Dacă elevul greșește, explică fără judecată și micșorează pasul. Folosește formulele în \\( ... \\) sau \\[ ... \\]. Nu folosi emoji. Nu pretinde că ai analizat fișiere fără conținut procesat. La finalul unei sesiuni, oferă recapitulare și quiz.`;

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
        { role: "user", content: `Materia: ${input.subject}\nMod: ${input.mode}\nÎntrebarea elevului: ${input.question}` },
        ...history,
      ],
      maxCompletionTokens: selected.tier === "premium" ? 1400 : selected.tier === "extended" ? 1000 : 700,
      reasoning: selected.tier === "routine" ? { effort: "minimal" } : { effort: selected.tier === "premium" ? "high" : "medium" },
    });
    const text = contentToText(result.choices?.[0]?.message?.content);
    if (!text) throw new Error("Ghidul nu a returnat un răspuns.");
    return { provider: "live" as const, text, model: selected.model, tier: selected.tier };
  }),
});
