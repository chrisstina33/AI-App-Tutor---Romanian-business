import { z } from "zod";
import { tutorDiagramSchema, validateTutorDiagram } from "../shared/tutor-diagram";
import { invokeLLM, type Message } from "./_core/llm";
import { transcribeAudioBase64 } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
const tutorAnalysisSchema = z.object({
  subject: z.enum(["Matematică", "Fizică", "Chimie", "Limba română", "Biologie", "necunoscut"]),
  schoolLevel: z.enum(["gimnaziu", "liceu", "necunoscut"]),
  difficulty: z.enum(["ușor", "mediu", "dificil", "necunoscut"]),
  confidence: z.number().min(0).max(1),
  mastery: z.enum(["demonstrated", "not_yet", "unknown"]),
}).strict();
const tutorResponseSchema = z.object({
  text: z.string().max(8000),
  analysis: tutorAnalysisSchema,
  diagram: tutorDiagramSchema.nullable(),
}).strict();
const tutorResponseJsonSchema = z.toJSONSchema(tutorResponseSchema, { target: "openai" });
const systemPrompt = `Ești Elunariq, un tutor în limba română pentru elevi de liceu. Răspunde concret la întrebarea elevului și adaptează explicația la materia, enunț și modul cerut. Nu folosi răspunsuri-șablon și nu introduce ecuații sau formule decât dacă sunt relevante pentru problema elevului; nu folosi exemple generice precum a+b=c fără motiv.

Respectă modul cerut: în guided oferă un singur pas și o întrebare, fără soluția completă; în hint oferă un indiciu; în concept explică ideea cerută; în example oferă un exemplu asemănător; în check verifică pasul trimis; în practice creează un exercițiu; în summary recapitulează și propune un mini-quiz; în direct răspunde complet și clar.

Folosește formule LaTeX doar când ajută la explicarea unei probleme matematice. Dacă informația lipsește, cere detaliul necesar în loc să inventezi un exemplu. Nu folosi emoji și nu pretinde că ai analizat fișiere fără conținut procesat.

Returnează numai obiectul JSON cerut de schema structurată. Completează răspunsul pedagogic în text, analiza materiei în analysis și diagrama interpretată în diagram (sau null dacă nu este utilă ori nu poate fi dedusă cu încredere). Nu produce SVG, HTML, coordonate de desen pentru geometrie sau atomi de decor.

Pentru categoria geometry, identifică figura, punctele/etichetele, segmentele, unghiurile, relațiile de paralelism/perpendicularitate/egalitate, cercurile și enunțate constrângerile exacte. Păstrează fiecare constrângere lizibilă în constraints și codifică unghiuri/lungimi cunoscute și în etichetele elementelor relevante. Referințele trebuie să indice numai ID-uri declarate. Pentru triunghi folosește punctele în ordinea conturului; pentru pătrat/dreptunghi la fel. Alege intersecting_lines când sunt două drepte care se intersectează. Setează schematic=true când măsurile ori unghiurile exacte lipsesc; nu inventa valori și nu pretinde că desenul este la scară. Fă unghiul de la C explicit prin vertex, ray1 și ray2.

Pentru categoria chemistry, emite graful molecular și proprietățile/constrângerile exacte în constraints: fiecare atom o singură dată, fiecare legătură cu ordinul corect, inclusiv ramificațiile și substituenții. Carbonul și hidrogenul implicit trebuie să respecte valența; hidrogenii impliciți nu se trimit ca atomi separați. Verifică numărul de atomi și conectivitatea structurii față de numele/enunțul moleculei. Dacă identificarea moleculei ori conectivitatea este ambiguă, setează diagram=null; nu ghici. Rendererul acceptă numai legături covalente neutre cu C, N, O, F, Cl, Br și I.

Folosește categoria schematic numai pentru explicații vizuale non-geometrice (de exemplu, o schemă de forțe). Coordonatele sunt permise numai aici și trebuie să fie o schiță orientativă. Dacă desenul corect nu poate fi construit din enunț, folosește diagram=null.

În diagramă, include toate câmpurile cerute de schemă. Câmpurile textuale label fără etichetă trebuie să fie șirul gol. În analysis, evaluează exercițiul curent și nu deduce materia doar din selector. Pentru date insuficiente folosește necunoscut și confidence sub 0.8. Folosește mastery="demonstrated" numai în modul check, după o încercare reală și corectă cu raționament; în celelalte moduri folosește unknown. Nu inventa clasa exactă.`;

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

export function parseTutorResponse(rawText: string) {
  let response: unknown;
  try {
    response = JSON.parse(rawText);
  } catch {
    console.error("[Tutor] Provider returned malformed structured JSON");
    throw new Error("Ghidul AI a returnat un răspuns structurat invalid. Încearcă din nou.");
  }
  const parsed = tutorResponseSchema.safeParse(response);
  if (!parsed.success) {
    console.error("[Tutor] Provider response failed schema validation", parsed.error.issues.map(({ path, code }) => ({ path, code })));
    throw new Error("Ghidul AI a returnat un răspuns incomplet. Încearcă din nou.");
  }
  if (parsed.data.diagram) {
    const diagramError = validateTutorDiagram(parsed.data.diagram);
    if (diagramError) {
      console.warn("[Tutor] Invalid diagram structure omitted", diagramError);
      return { ...parsed.data, diagram: null };
    }
  }
  return parsed.data;
}

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
        { role: "system", content: `${systemPrompt}\n\nIdentifică nivelul școlar potrivit din cerință și rezolvă și probleme de gimnaziu, cu programa și vocabularul acelui nivel. Dacă nu se poate deduce clasa, nu o inventa. Când este util, menționează pe scurt nivelul orientativ și dificultatea. Nivelul de experiență declarat de elev este „${input.learnerLevel ?? "Îmi formez încrederea"}”, iar stilul preferat este „${input.explanationStyle ?? "Scurt și clar"}”. Explică în pași mici, definește termenii noi și verifică înțelegerea înainte de a continua. În modul ghidat oferă un singur pas odată, cu o întrebare clară. Dacă materia selectată pare să nu corespundă cerinței, identifică materia potrivită și adaptează explicația fără să schimbi răspunsul pe baza unei presupuneri nesigure.` },
        ...history,
        { role: "user", content: userContent },
      ],
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "elunariq_tutor_response",
          schema: tutorResponseJsonSchema,
          strict: true,
        },
      },
      maxCompletionTokens: selected.tier === "premium" ? 1700 : selected.tier === "extended" ? 1400 : 1100,
      reasoning: selected.tier === "routine" ? { effort: "minimal" } : { effort: selected.tier === "premium" ? "high" : "medium" },
    });
    const rawText = contentToText(result.choices?.[0]?.message?.content);
    const tutorResponse = parseTutorResponse(rawText);
    if (!tutorResponse.text.trim() && !tutorResponse.diagram) throw new Error("Ghidul nu a returnat un răspuns.");
    return {
      provider: "live" as const,
      text: tutorResponse.text,
      model: selected.model,
      tier: selected.tier,
      ...(tutorResponse.diagram ? { diagram: tutorResponse.diagram } : {}),
      analysis: tutorResponse.analysis,
    };
  }),
});
