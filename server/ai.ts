import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";
import { transcribeAudioBase64 } from "./_core/voiceTranscription";
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
  transcribe: publicProcedure.input(z.object({ base64: z.string().min(1).max(23_000_000), mimeType: z.string().max(80) })).mutation(async ({ input }) => {
    const result = await transcribeAudioBase64({ ...input, language: "ro" });
    if ("error" in result) throw new Error(result.error);
    return { text: result.text, duration: result.duration, language: result.language };
  }),
  chat: publicProcedure.input(z.object({ subject: z.string().min(1).max(80), mode: z.enum(tutorModes), question: z.string().max(4000), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20), attachment: z.object({ name: z.string().max(180), mimeType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/plain"]), base64: z.string().max(15_000_000) }).optional() }).refine((input) => Boolean(input.question.trim()) || Boolean(input.attachment), { message: "Scrie o întrebare sau atașează tema." })).mutation(async ({ input }) => {
    const selected = modelFor(input);
    const history: Message[] = input.messages.map((message) => ({ role: message.role, content: message.text }));
    let userContent: Message["content"] = `Materia: ${input.subject}\nMod: ${input.mode}\nÎntrebarea elevului: ${input.question || "Analizează enunțul din fișierul atașat și ajută-mă cu primul pas."}`;
    if (input.attachment) {
      const dataUrl = `data:${input.attachment.mimeType};base64,${input.attachment.base64}`;
      if (input.attachment.mimeType.startsWith("image/")) {
        userContent = [
          { type: "text", text: `${userContent}\nFișier atașat: ${input.attachment.name}. Citește enunțul vizibil din imagine. Dacă nu este lizibil, cere o fotografie mai clară.` },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ];
      } else if (input.attachment.mimeType === "application/pdf") {
        userContent = [
          { type: "text", text: `${userContent}\nFișier PDF atașat: ${input.attachment.name}. Citește enunțul din document. Dacă nu îl poți accesa, spune clar acest lucru.` },
          { type: "file_url", file_url: { url: dataUrl, mime_type: "application/pdf" } },
        ];
      } else {
        const decoded = Buffer.from(input.attachment.base64, "base64").toString("utf8").slice(0, 40_000);
        userContent = `${userContent}\nConținutul fișierului ${input.attachment.name}:\n${decoded}`;
      }
    }
    const result = await invokeLLM({
      model: selected.model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: userContent },
      ],
      maxCompletionTokens: selected.tier === "premium" ? 1400 : selected.tier === "extended" ? 1000 : 700,
      reasoning: selected.tier === "routine" ? { effort: "minimal" } : { effort: selected.tier === "premium" ? "high" : "medium" },
    });
    const text = contentToText(result.choices?.[0]?.message?.content);
    if (!text) throw new Error("Ghidul nu a returnat un răspuns.");
    return { provider: "live" as const, text, model: selected.model, tier: selected.tier };
  }),
});
