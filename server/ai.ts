import { z } from "zod";
import { invokeLLM, type Message } from "./_core/llm";
import { transcribeAudioBase64 } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
const coordinate = z.number().min(0).max(100);
const drawingElementSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("line"), x1: coordinate, y1: coordinate, x2: coordinate, y2: coordinate, arrow: z.boolean().optional(), label: z.string().max(30).optional() }),
  z.object({ type: z.literal("point"), x: coordinate, y: coordinate, label: z.string().max(30).optional() }),
  z.object({ type: z.literal("circle"), x: coordinate, y: coordinate, radius: z.number().min(1).max(40), label: z.string().max(30).optional() }),
  z.object({ type: z.literal("rectangle"), x: coordinate, y: coordinate, width: z.number().min(1).max(90), height: z.number().min(1).max(90), label: z.string().max(30).optional() }),
  z.object({ type: z.literal("polyline"), points: z.array(z.object({ x: coordinate, y: coordinate })).min(2).max(20), label: z.string().max(30).optional() }),
  z.object({ type: z.literal("text"), x: coordinate, y: coordinate, text: z.string().min(1).max(60) }),
]);
const tutorDrawingSchema = z.object({
  caption: z.string().min(1).max(100),
  steps: z.array(z.object({ calculation: z.string().min(1).max(100), meaning: z.string().min(1).max(140) })).max(6),
  elements: z.array(drawingElementSchema).max(30),
});
const tutorAnalysisSchema = z.object({
  subject: z.enum(["Matematică", "Fizică", "Chimie", "Limba română", "Biologie", "necunoscut"]),
  schoolLevel: z.enum(["gimnaziu", "liceu", "necunoscut"]),
  difficulty: z.enum(["ușor", "mediu", "dificil", "necunoscut"]),
  confidence: z.number().min(0).max(1),
  mastery: z.enum(["demonstrated", "not_yet", "unknown"]),
});
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
  chat: publicProcedure.input(z.object({ subject: z.string().min(1).max(80), mode: z.enum(tutorModes), question: z.string().max(4000), learnerLevel: z.enum(["La început", "Îmi formez încrederea", "Pregătit pentru examen"]).optional(), explanationStyle: z.enum(["Scurt și clar", "Detaliat și vizual", "Întrebări socratice"]).optional(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(20), attachment: z.object({ name: z.string().max(180), mimeType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/plain"]), base64: z.string().max(15_000_000) }).optional() }).refine((input) => Boolean(input.question.trim()) || Boolean(input.attachment), { message: "Scrie o întrebare sau atașează tema." })).mutation(async ({ input }) => {
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
        { role: "system", content: `${systemPrompt}\n\nIdentifică nivelul școlar potrivit din cerință și rezolvă și probleme de gimnaziu, cu programa și vocabularul acelui nivel. Dacă nu se poate deduce clasa, nu o inventa. Când este util, menționează pe scurt nivelul orientativ și dificultatea (ușor, mediu sau dificil). Nivelul de experiență declarat de elev este „${input.learnerLevel ?? "Îmi formez încrederea"}”, iar stilul preferat este „${input.explanationStyle ?? "Scurt și clar"}”. Explică în pași mici, definește termenii noi și verifică înțelegerea înainte de a continua. În modul ghidat oferă un singur pas odată, cu o întrebare clară. Dacă materia selectată pare să nu corespundă cerinței, identifică materia potrivită și adaptează explicația fără să schimbi răspunsul pe baza unei presupuneri nesigure.\n\nCând un desen clarifică problema, adaugă la final un singur bloc <elunariq_sketch>JSON</elunariq_sketch>, fără backticks. JSON-ul trebuie să aibă caption (text scurt), steps (maximum 6 obiecte {calculation, meaning}) și elements (maximum 30 elemente). Coordonatele sunt numere de la 0 la 100. Forme permise: {type:"line",x1,y1,x2,y2,arrow?,label?}, {type:"point",x,y,label?}, {type:"circle",x,y,radius,label?}, {type:"rectangle",x,y,width,height,label?}, {type:"polyline",points:[{x,y},...],label?}, {type:"text",x,y,text}. Pentru guided, steps conține numai pasul explicat în acest răspuns; pentru celelalte moduri, arată transformările matematice esențiale în ordine. Păstrează exact valorile, etichetele și relațiile din enunț; nu inventa date și nu pretinde că desenul este la scară. Dacă nu poți construi un desen corect din informațiile disponibile, nu include blocul.` },
        { role: "system", content: `Dacă emiți blocul <elunariq_sketch>, conținutul lui trebuie să fie JSON valid. Nu scrie comentarii sau backticks în interior. Exemplu de forma permisă: {"caption":"Ecuație cu două transformări","steps":[{"calculation":"6x + 7 = 67","meaning":"Ecuația inițială"},{"calculation":"6x = 60","meaning":"Scădem 7 din ambele părți"}],"elements":[{"type":"rectangle","x":12,"y":28,"width":36,"height":28,"label":"6x"},{"type":"text","x":53,"y":46,"text":"+ 7 = 67"}]}. Folosește numai tipurile de forme și câmpurile permise anterior. Dacă nu poți garanta un desen fidel enunțului, omite întregul bloc.` },
        { role: "system", content: `La finalul răspunsului adaugă și un singur bloc <elunariq_analysis>JSON</elunariq_analysis> valid, cu această structură: {"subject":"Matematică|Fizică|Chimie|Limba română|Biologie|necunoscut","schoolLevel":"gimnaziu|liceu|necunoscut","difficulty":"ușor|mediu|dificil|necunoscut","confidence":0.0,"mastery":"demonstrated|not_yet|unknown"}. Evaluează exercițiul curent, nu presupune doar materia selectată. Dacă nu ai suficiente indicii, folosește necunoscut și confidence sub 0.8. Folosește mastery="demonstrated" numai în modul check, după ce elevul a trimis o încercare reală cu raționament corect care arată că poate continua singur. Pentru răspunsuri scurte fără raționament, indicii insuficiente sau erori, alege not_yet ori unknown; în celelalte moduri folosește unknown. Nu inventa clasa exactă.` },
        ...history,
        { role: "user", content: userContent },
      ],
      maxCompletionTokens: selected.tier === "premium" ? 1400 : selected.tier === "extended" ? 1000 : 700,
      reasoning: selected.tier === "routine" ? { effort: "minimal" } : { effort: selected.tier === "premium" ? "high" : "medium" },
    });
    const rawText = contentToText(result.choices?.[0]?.message?.content);
    const analysisMatch = rawText.match(/<elunariq_analysis>\s*([\s\S]*?)\s*<\/elunariq_analysis>/i);
    let analysis: z.infer<typeof tutorAnalysisSchema> | undefined;
    if (analysisMatch) {
      try {
        const json = analysisMatch[1].replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        analysis = tutorAnalysisSchema.parse(JSON.parse(json));
      } catch {
        // Keep the conversational reply if the model's classification is malformed.
      }
    }
    const drawingMatch = rawText.match(/<elunariq_sketch>\s*([\s\S]*?)\s*<\/elunariq_sketch>/i);
    let drawing: z.infer<typeof tutorDrawingSchema> | undefined;
    if (drawingMatch) {
      try {
        const json = drawingMatch[1].replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        drawing = tutorDrawingSchema.parse(JSON.parse(json));
      } catch {
        // An invalid or unsafe sketch is omitted; the tutor's written answer remains usable.
      }
    }
    const text = rawText
      .replace(/<elunariq_sketch>[\s\S]*?<\/elunariq_sketch>/i, "")
      .replace(/<elunariq_analysis>[\s\S]*?<\/elunariq_analysis>/i, "")
      .trim();
    if (!text && !drawing) throw new Error("Ghidul nu a returnat un răspuns.");
    return { provider: "live" as const, text: text || "Urmărește pașii și desenul de mai jos.", model: selected.model, tier: selected.tier, ...(drawing ? { drawing } : {}), ...(analysis ? { analysis } : {}) };
  }),
});
