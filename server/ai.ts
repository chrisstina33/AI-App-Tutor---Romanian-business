import { z } from "zod";
import { tutorDiagramSchema, validateTutorDiagram, type TutorDiagram } from "../shared/tutor-diagram";
import { invokeLLM, type Message } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudioBase64 } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
const tutorAnalysisSchema = z.object({
  subject: z.enum(["Matematică", "Fizică", "Chimie", "Limba română", "Biologie", "Informatică", "necunoscut"]),
  schoolLevel: z.enum(["gimnaziu", "liceu", "necunoscut"]),
  difficulty: z.enum(["ușor", "mediu", "dificil", "necunoscut"]),
  confidence: z.number().min(0).max(1),
  mastery: z.enum(["demonstrated", "not_yet", "unknown"]),
}).strict();
const tutorResponseSchema = z.object({
  text: z.string().max(8000),
  analysis: tutorAnalysisSchema,
  diagram: tutorDiagramSchema.nullable(),
  imagePrompt: z.string().max(1200).nullable(),
}).strict();
export const tutorChatInputSchema = z.object({
  subject: z.string().min(1).max(80),
  mode: z.enum(tutorModes),
  question: z.string().max(4000),
  learnerLevel: z.enum(["La început", "Îmi formez încrederea", "Pregătit pentru examen"]).optional(),
  explanationStyle: z.enum(["Scurt și clar", "Detaliat și vizual", "Întrebări socratice"]).optional(),
  visualMode: z.boolean().optional(),
  messages: z.array(z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), text: z.string().max(4000) }),
    z.object({ role: z.literal("assistant"), text: z.string().max(8000) }),
  ])).max(20),
  attachment: z.object({
    name: z.string().max(180),
    mimeType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/plain"]),
    base64: z.string().max(15_000_000),
  }).optional(),
}).refine((input) => Boolean(input.question.trim()) || Boolean(input.attachment), {
  message: "Scrie o întrebare sau atașează tema.",
});

function normalizeStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalizeStructuredOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [
    key === "oneOf" ? "anyOf" : key,
    normalizeStructuredOutputSchema(value),
  ]));
}

export const tutorResponseJsonSchema = normalizeStructuredOutputSchema(
  z.toJSONSchema(tutorResponseSchema, { target: "openai" }),
) as Record<string, unknown>;
const systemPrompt = `Ești Elunariq, un tutor în limba română pentru elevi. Răspunde concret la întrebarea elevului și adaptează explicația la materie, enunț, nivelul identificabil și modul cerut. Respectă programa școlară din România (MEC) și vocabularul potrivit nivelului; nu pretinde că verifici o programă sau o clasă exactă pe care nu ai primit-o și cere clasa doar dacă schimbă semnificativ răspunsul. Nu folosi răspunsuri-șablon și nu introduce ecuații sau formule decât dacă sunt relevante pentru problema elevului; nu folosi exemple generice precum a+b=c fără motiv.

Respectă modul cerut: în guided oferă un singur pas de învățare, explicat suficient de clar, și o întrebare, fără soluția completă; în hint oferă un indiciu util; în concept explică ideea cu definiții și un exemplu potrivit; în example arată un exemplu asemănător rezolvat; în check verifică pasul trimis și explică de ce este corect sau ce trebuie corectat; în practice creează un exercițiu; în summary oferă o recapitulare structurată și un mini-quiz; în direct răspunde complet și clar. Evită răspunsurile telegrafice: include pașii de raționament relevanți, explică termenii noi și oferă suficiente detalii ca elevul să poată continua singur. Păstrează un singur pas în guided, dar explică acel pas complet.

Folosește formule LaTeX când clarifică matematica sau chimia. La chimie, explică formulele și simbolurile, arată metoda de echilibrare pas cu pas când se cere și verifică numărul atomilor; nu sări direct la rezultat. Dacă informația lipsește, cere detaliul necesar în loc să inventezi un exemplu. Nu folosi emoji și nu pretinde că ai analizat fișiere fără conținut procesat.

Returnează numai obiectul JSON cerut de schema structurată. Completează răspunsul pedagogic în text, analiza materiei în analysis, diagrama interpretată în diagram (sau null dacă nu este utilă ori nu poate fi dedusă cu încredere) și imagePrompt (sau null când elevul nu a cerut explicit o imagine ilustrativă). Pentru o cerere explicită de imagine, oferă în imagePrompt o descriere concretă, educațională, potrivită nivelului și materiei; nu include text sau etichete în imagine decât dacă sunt esențiale. Pentru structuri chimice, reacții și desene geometrice exacte, folosește diagrama validată, nu înlocui informația exactă cu o imagine ilustrativă. Nu produce SVG, HTML, coordonate de desen pentru geometrie sau atomi de decor.

Pentru categoria geometry, identifică figura, punctele/etichetele, segmentele, unghiurile, relațiile de paralelism/perpendicularitate/egalitate și cercurile cerute. Desenul trebuie să conțină numai figura și informațiile geometrice relevante pentru a o reprezenta; nu include calcule, formule de rezolvare, răspunsuri sau detalii fără legătură cu desenul. În câmpul constraints păstrează doar datele geometrice explicite din enunț care nu sunt deja reprezentate de etichete sau marcaje; pentru o figură cerută fără date suplimentare, lasă lista goală. Codifică lungimile și unghiurile cunoscute în etichetele elementelor relevante. Referințele trebuie să indice numai ID-uri declarate. Pentru paralelogram folosește figura parallelogram, exact patru puncte în ordinea conturului și cele patru laturi, fără diagonale dacă nu sunt cerute. Pentru triunghi, pătrat și dreptunghi folosește punctele și laturile în ordinea ciclului conturului. Alege intersecting_lines când sunt două drepte care se intersectează. Marchează un unghi ca drept numai când enunțul spune explicit că măsoară 90° ori că este perpendicular; nu deduce egalități sau perpendicularități doar din tipul figurii. Setează schematic=true când măsurile ori unghiurile exacte lipsesc; nu inventa valori și nu pretinde că desenul este la scară. Fă unghiul de la C explicit prin vertex, ray1 și ray2.

În Fizică, nu folosi categoria geometry pentru diagrame de concepte, vectori, circuite, optică sau mecanică; folosește schematic numai când schema fizică este cerută și poate fi reprezentată corect. Pentru categoria chemistry, emite graful molecular și proprietățile/constrângerile exacte în constraints: fiecare atom o singură dată, fiecare legătură cu ordinul corect, inclusiv ramificațiile și substituenții. Carbonul și hidrogenul implicit trebuie să respecte valența; hidrogenii impliciți nu se trimit ca atomi separați. Verifică numărul de atomi și conectivitatea structurii față de numele/enunțul moleculei. Dacă identificarea moleculei ori conectivitatea este ambiguă, setează diagram=null; nu ghici. Rendererul acceptă molecule neutre cu legături simple, duble și triple formate din C, N, O, P, S, F, Cl, Br și I, inclusiv lanțuri ramificate și molecule cu un singur inel.

Folosește categoria schematic numai pentru explicații vizuale non-geometrice (de exemplu, o schemă de forțe). Coordonatele sunt permise numai aici și trebuie să fie o schiță orientativă. Dacă desenul corect nu poate fi construit din enunț, folosește diagram=null.

În diagramă, include toate câmpurile cerute de schemă. Câmpurile textuale label fără etichetă trebuie să fie șirul gol. În analysis, evaluează exercițiul curent și nu deduce materia doar din selector. Pentru date insuficiente folosește necunoscut și confidence sub 0.8. Folosește mastery="demonstrated" numai în modul check, după o încercare reală și corectă cu raționament; în celelalte moduri folosește unknown. Nu inventa clasa exactă.`;

const diagramRequestTerms = /deseneaz\w*|desen\w*|schiț\w*|schit\w*|diagram\w*|reprezint\w*|ilustreaz\w*|draw\w*|sketch\w*|illustrat\w*/iu;
const imageRequestTerms = /\b(?:genere\w*|cree\w*|realize\w*|desene\w*|ilustre\w*|fă\w*|fa\w*|vreau|aș dori|as dori|poți|poti|ai putea|trimite|arată-mi|arata-mi)\b[\s\S]{0,160}\b(?:imagin\w*|poz\w*|fotograf\w*|ilustra\w*|picture|photo)\b/iu;
const otherVisualRequestTerms = /schemă|schema|resurs\w* vizual\w*|material\w* didactic\w* complex\w*|plan\w* de lecți\w*|formul\w* structur\w*|structur\w* molecular\w*/iu;

export function isImageGenerationRequest(question: string): boolean {
  return imageRequestTerms.test(question);
}

function isVisualRequest(question: string): boolean {
  return diagramRequestTerms.test(question)
    || isImageGenerationRequest(question)
    || otherVisualRequestTerms.test(question);
}

type TutorModel = "gpt-5-mini" | "gpt-5" | "gpt-5.5";
type ModelTier = "low" | "medium" | "high";
type SelectedModel = { model: TutorModel; tier: ModelTier };

export function modelFor(input: {
  mode: (typeof tutorModes)[number];
  question: string;
  subject?: string;
  hasAttachment?: boolean;
  visualMode?: boolean;
}): SelectedModel {
  const visualRequest = isVisualRequest(input.question) || Boolean(input.visualMode);
  if (input.hasAttachment || visualRequest || input.question.length > 1800) {
    return { model: "gpt-5.5", tier: "high" };
  }
  const mediumComplexity = /mai mulți pași|mai multe etape|pas cu pas|rezolvă complet|rezolvare completă|explică în detaliu|explicați\w* complex\w*|explicație complexă|demonstrează|arată derivarea|compară|multi-step|step by step|stoichiometr\w*|stoechiometr\w*|reacți\w*|echilibr\w* chimic\w*|balance\w* reaction\w*/iu;
  if (mediumComplexity.test(input.question) || input.question.length > 900) {
    return { model: "gpt-5", tier: "medium" };
  }
  return { model: "gpt-5-mini", tier: "low" };
}

export async function invokeTutorWithFallback<T>(
  selected: SelectedModel,
  invoke: (model: TutorModel) => Promise<T>,
): Promise<{ result: T; model: TutorModel; tier: ModelTier }> {
  const fallbackModels: Record<TutorModel, TutorModel[]> = {
    "gpt-5-mini": ["gpt-5-mini", "gpt-5"],
    "gpt-5": ["gpt-5", "gpt-5.5", "gpt-5-mini"],
    "gpt-5.5": ["gpt-5.5", "gpt-5", "gpt-5-mini"],
  };
  let lastError: unknown;
  for (const model of fallbackModels[selected.model]) {
    try {
      return {
        result: await invoke(model),
        model,
        tier: model === "gpt-5-mini" ? "low" : model === "gpt-5" ? "medium" : "high",
      };
    } catch (error) {
      lastError = error;
      if (model !== fallbackModels[selected.model].at(-1)) {
        console.warn(`[Tutor] ${model} request failed; trying the next configured model.`);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Niciun model AI configurat nu a putut procesa cererea.");
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

export function diagramForTutorSubject(
  subject: string,
  diagram: TutorDiagram | undefined,
): TutorDiagram | undefined {
  if ((subject === "Fizică" || subject === "Chimie") && diagram?.category === "geometry") {
    return undefined;
  }
  return diagram;
}

export const assistantRouter = router({
  transcribe: publicProcedure.input(z.object({ base64: z.string().min(1).max(23_000_000), mimeType: z.string().max(80) })).mutation(async ({ input }) => {
    const result = await transcribeAudioBase64({ ...input, language: "ro" });
    if ("error" in result) throw new Error(result.error);
    return { text: result.text, duration: result.duration, language: result.language };
  }),
  chat: publicProcedure.input(tutorChatInputSchema).mutation(async ({ input }) => {
    const selected = modelFor({
      mode: input.mode,
      question: input.question,
      subject: input.subject,
      hasAttachment: Boolean(input.attachment),
      visualMode: input.visualMode || input.explanationStyle === "Detaliat și vizual",
    });
    const imageRequested = isImageGenerationRequest(input.question);
    const visualMode = input.visualMode || input.explanationStyle === "Detaliat și vizual";
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
    const modelResult = await invokeTutorWithFallback(selected, async (model) => {
      const result = await invokeLLM({
        model,
        messages: [
          { role: "system", content: `${systemPrompt}\n\nGenerează diagramă numai dacă întrebarea curentă o cere explicit sau dacă este esențială pentru explicația curentă. Folosește doar enunțul curent pentru a decide ce să desenezi; nu copia și nu repeta diagrame din mesajele anterioare decât dacă elevul cere explicit să revii la ele. Pentru vectori folosește săgeți orientate și etichete de mărime/direcție cerute. În fizică, desenele de mecanică, termodinamică, electricitate, optică, oscilații și unde trebuie să arate numai elementele fizice relevante, cu convențiile și sensurile corecte; nu adăuga calcule în desen. Folosește marcajul de unghi drept numai pentru 90° explicit. La formule moleculare/structurale folosește diagrama chemistry. Pentru ecuații stoechiometrice folosește diagrama reaction și verifică numărul fiecărui atom pe ambele părți; dacă nu poți verifica ecuația, setează diagram=null.\n\nIdentifică nivelul școlar potrivit din cerință și rezolvă și probleme de gimnaziu, cu programa și vocabularul acelui nivel. Dacă nu se poate deduce clasa, nu o inventa. Când este util, menționează nivelul orientativ și dificultatea. Nivelul de experiență declarat de elev este „${input.learnerLevel ?? "Îmi formez încrederea"}”, iar stilul preferat este „${input.explanationStyle ?? "Scurt și clar"}”; chiar și când se preferă concizia, răspunsul trebuie să conțină explicația necesară, nu doar rezultatul. Explică în pași mici, definește termenii noi și verifică înțelegerea înainte de a continua. În modul ghidat oferă un singur pas odată, cu o întrebare clară. Dacă materia selectată pare să nu corespundă cerinței, identifică materia potrivită și adaptează explicația fără să schimbi răspunsul pe baza unei presupuneri nesigure.` },
          ...(visualMode ? [{
            role: "system" as const,
            content: "Modul de explicație vizuală este activ. Include o diagramă educațională simplă și relevantă când ajută înțelegerea; folosește categoria corectă și păstrează reprezentarea exactă conform regulilor de mai sus. Nu înlocui diagramele științifice cu ilustrații decorative.",
          }] : []),
          ...(input.subject === "Informatică" ? [{
            role: "system" as const,
            content: "Pentru Informatică, predă algoritmi și programare la nivelul școlar cerut: explică ideea înainte de cod, urmărește execuția pas cu pas pe exemple mici și clarifică variabilele, condițiile, buclele, funcțiile și structurile de date când apar. Respectă limbajul de programare cerut de elev; dacă nu este precizat și contează, întreabă înainte să scrii cod. Pentru depanare, indică întâi cauza și un indiciu, iar soluția completă numai când modul sau cererea o solicită. Folosește pseudocod ori o schemă simplă pentru vizualizarea algoritmilor când ajută.",
          }] : []),
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
        maxCompletionTokens: model === "gpt-5.5" ? 3000 : model === "gpt-5" ? 2200 : 1500,
        reasoning: model === "gpt-5-mini" ? { effort: "low" } : { effort: model === "gpt-5.5" ? "high" : "medium" },
      });
      const rawText = contentToText(result.choices?.[0]?.message?.content);
      const parsedResponse = parseTutorResponse(rawText);
      const diagramSubject = parsedResponse.analysis.subject === "necunoscut"
        ? input.subject
        : parsedResponse.analysis.subject;
      const subjectDiagram = diagramForTutorSubject(diagramSubject, parsedResponse.diagram ?? undefined);
      if (parsedResponse.diagram && !subjectDiagram) {
        console.warn("[Tutor] Mathematical geometry figure omitted for a science response");
      }
      if (!parsedResponse.text.trim() && !parsedResponse.diagram) {
        throw new Error("Ghidul nu a returnat un răspuns.");
      }
      return { ...parsedResponse, diagram: subjectDiagram ?? null };
    });
    const tutorResponse = modelResult.result;
    let imageUrl: string | undefined;
    let imageError: string | undefined;
    if (imageRequested) {
      try {
        const prompt = tutorResponse.imagePrompt?.trim()
          || `Ilustrație educațională clară, potrivită pentru materia ${input.subject}, fără text decorativ. Cererea elevului: ${input.question}`;
        const generatedImage = await generateImage({ prompt });
        if (!generatedImage.url) throw new Error("Image service returned no URL");
        imageUrl = generatedImage.url;
      } catch (error) {
        console.error("[Tutor] Requested image generation failed", error instanceof Error ? error.message : "unknown error");
        imageError = "Răspunsul este gata, dar imaginea nu a putut fi generată acum. Verifică dacă serviciul de imagini este configurat pe server și încearcă din nou.";
      }
    }
    return {
      provider: "live" as const,
      text: tutorResponse.text,
      model: modelResult.model,
      tier: modelResult.tier,
      ...(tutorResponse.diagram ? { diagram: tutorResponse.diagram } : {}),
      ...(imageUrl ? { imageUrl } : {}),
      ...(imageError ? { imageError } : {}),
      analysis: tutorResponse.analysis,
    };
  }),
});
