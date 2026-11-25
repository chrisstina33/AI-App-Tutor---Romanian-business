import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { tutorDiagramSchema, validateTutorDiagram, type TutorDiagram } from "../shared/tutor-diagram";
import { invokeLLM, LLMRequestTimeoutError, type Message, type MessageContent } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import { transcribeAudioBase64 } from "./_core/voiceTranscription";
import { publicProcedure, router } from "./_core/trpc";
import { normalizeTutorResponseText, normalizeTutorTitle } from "../shared/tutor-text";

const tutorModes = ["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"] as const;
export function tutorModeInstruction(mode: (typeof tutorModes)[number]): string {
  if (mode === "direct") {
    return "Elevul a selectat explicit „Răspuns complet”. Oferă rezolvarea completă, corectă și concisă, pas cu pas, cu explicația necesară pentru fiecare pas și rezultatul final verificat. Nu te opri la un indiciu, nu cere elevului să continue singur și nu adăuga pași sau detalii inutile. Dacă enunțul nu conține informațiile esențiale, spune clar ce lipsește și întreabă doar acel lucru.";
  }
  return "";
}
const tutorAnalysisSchema = z.object({
  subject: z.enum(["Matematică", "Fizică", "Chimie", "Limba română", "Biologie", "Informatică", "Istorie", "Geografie", "Limba engleză", "necunoscut"]),
  schoolLevel: z.enum(["gimnaziu", "liceu", "olimpiada", "necunoscut"]),
  difficulty: z.enum(["ușor", "mediu", "dificil", "necunoscut"]),
  confidence: z.number().min(0).max(1),
  mastery: z.enum(["demonstrated", "not_yet", "unknown"]),
}).strict();
const tutorResponseSchema = z.object({
  title: z.string().trim().min(3).max(80),
  text: z.string().max(8000),
  analysis: tutorAnalysisSchema,
  diagram: tutorDiagramSchema.nullable(),
  imagePrompt: z.string().max(1200).nullable(),
}).strict();
const tutorAttachmentSchema = z.object({
  name: z.string().max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "application/pdf", "text/plain"]),
  base64: z.string().max(15_000_000),
});
export const tutorChatInputSchema = z.object({
  subject: z.string().min(1).max(80),
  mode: z.enum(tutorModes),
  question: z.string().max(4000),
  learnerLevel: z.enum(["La început", "Îmi formez încrederea", "Pregătit pentru examen"]).optional(),
  schoolGrade: z.enum(["Nu o precizez", "Clasa a V-a", "Clasa a VI-a", "Clasa a VII-a", "Clasa a VIII-a", "Clasa a IX-a", "Clasa a X-a", "Clasa a XI-a", "Clasa a XII-a"]).optional(),
  explanationStyle: z.enum(["Scurt și clar", "Detaliat și vizual", "Întrebări socratice"]).optional(),
  studiedTopics: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  diagnosticScore: z.number().int().min(0).max(3).optional(),
  visualMode: z.boolean().optional(),
  messages: z.array(z.discriminatedUnion("role", [
    z.object({ role: z.literal("user"), text: z.string().max(4000) }),
    z.object({ role: z.literal("assistant"), text: z.string().max(8000) }),
  ])).max(20),
  attachment: tutorAttachmentSchema.optional(),
  attachments: z.array(tutorAttachmentSchema).optional(),
}).superRefine((input, context) => {
  const attachments = [
    ...(input.attachment ? [input.attachment] : []),
    ...(input.attachments ?? []),
  ];
  if (!input.question.trim() && !attachments.length) {
    context.addIssue({ code: "custom", message: "Scrie o întrebare sau atașează tema." });
  }
  if (attachments.reduce((total, attachment) => total + attachment.base64.length, 0) > 40_000_000) {
    context.addIssue({
      code: "custom",
      path: ["attachments"],
      message: "Atașamentele depășesc limita tehnică pentru o singură cerere. Trimite mai puține fișiere odată.",
    });
  }
});

function normalizeStructuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(normalizeStructuredOutputSchema);
  if (!schema || typeof schema !== "object") return schema;
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [
    key === "oneOf" ? "anyOf" : key,
    normalizeStructuredOutputSchema(value),
  ]));
}

export function shouldOmitGeometryDiagram(
  subject: string,
  question: string,
): boolean {
  return subject === "Matematică"
    && geometryFormulaTerms.test(question)
    && geometryContextTerms.test(question)
    && !diagramRequestTerms.test(question);
}

export const tutorResponseJsonSchema = normalizeStructuredOutputSchema(
  z.toJSONSchema(tutorResponseSchema, { target: "openai" }),
) as Record<string, unknown>;
const systemPrompt = `Ești Elunariq, un tutor în limba română pentru elevi. Răspunde concret la întrebarea elevului și adaptează explicația la materie, enunț, clasă, nivelul identificabil și modul cerut. Respectă programa școlară din România (MEC) și vocabularul potrivit nivelului; dacă elevul a precizat clasa, folosește doar noțiuni și notații potrivite acelei clase. Dacă nu a precizat-o și schimbă semnificativ răspunsul, întreabă-l în loc să ghicești. Temele declarate ca studiate sunt singurele pe care le poți presupune cunoscute; pentru noțiunile nedeclarate, verifică ce știe elevul și explică termenii pe înțelesul lui înainte să îi folosești. Dacă elevul spune că nu a studiat o noțiune sau că nu o înțelege, nu continua să o folosești ca și cum ar fi cunoscută: clarifică termenii necesari și pornește de la un exemplu simplu. Scorul mini-quizului inițial este doar un indiciu orientativ, nu o notă și nu dovedește stăpânirea materiei; folosește-l pentru a calibra primul pas, apoi verifică înțelegerea prin dialog. Nu introduce concepte universitare sau notații avansate (de exemplu, forma Jordan) decât dacă elevul le cere explicit și sunt potrivite programei și clasei. Nu folosi jargon fără explicație, formule greu de urmărit sau salturi peste pași. Nu folosi răspunsuri-șablon și nu introduce ecuații sau formule decât dacă sunt relevante pentru problema elevului; nu folosi exemple generice precum a+b=c fără motiv.

Respectă modul cerut: în guided oferă un singur pas de învățare, explicat suficient de clar, și o singură întrebare, fără soluția completă; în hint oferă un singur indiciu util; în concept explică doar ideea cerută; în example arată un singur exemplu asemănător; în check verifică pasul trimis și explică pe scurt de ce este corect sau ce trebuie corectat; în practice creează un singur exercițiu; în summary oferă o recapitulare structurată și un mini-quiz scurt; în direct răspunde complet numai când elevul cere explicit. În răspunsurile obișnuite, folosește cel mult două paragrafe scurte, explică un singur pas și oprește-te pentru răspunsul elevului. Nu adăuga pași următori nesolicitați și nu copleși elevul cu informații.

Respectă metoda cerută explicit de elev (de exemplu, inducție matematică, binomul lui Newton sau calcul direct); nu o înlocui cu altă metodă. Nu introduce variabile, parametri ori notații care nu apar în enunț. Dacă metoda cerută nu se poate aplica pe baza informațiilor date, explică pe scurt ce lipsește și întreabă elevul. Păstrează explicațiile concise și clare, fără pași inutili.

Pentru formule, folosește EXCLUSIV delimitatorii $ ... $ pentru matematică inline și $$ ... $$ pentru blocuri. Folosește sintaxă LaTeX validă cu backslash, de exemplu \\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}, \\sum_{k=0}^{n} și \\binom{n}{k}. Nu folosi niciodată paranteze drepte [ ] izolate pe rânduri noi și nu lăsa linii goale excesive în formule. La chimie, explică formulele și simbolurile, arată metoda de echilibrare pas cu pas când se cere și verifică numărul atomilor; nu sări direct la rezultat. Dacă informația lipsește, cere detaliul necesar în loc să inventezi un exemplu. Nu folosi emoji și nu pretinde că ai analizat fișiere fără conținut procesat.

Returnează numai obiectul JSON cerut de schema structurată. Completează răspunsul pedagogic în text, analiza materiei în analysis, diagrama interpretată în diagram (sau null dacă nu este utilă ori nu poate fi dedusă cu încredere) și imagePrompt (sau null când elevul nu a cerut explicit o imagine ilustrativă). Pentru o cerere explicită de imagine, oferă în imagePrompt o descriere concretă, educațională, potrivită nivelului și materiei; nu include text sau etichete în imagine decât dacă sunt esențiale. Pentru structuri chimice, reacții și desene geometrice exacte, folosește diagrama validată, nu înlocui informația exactă cu o imagine ilustrativă. Nu produce SVG, HTML, coordonate de desen pentru geometrie sau atomi de decor.

Completează și câmpul title cu un titlu scurt, descriptiv, în română, de 3–6 cuvinte, bazat pe materia și problema elevului. Titlul trebuie să fie text simplu, fără formule, semne %, $, hashtaguri sau ghilimele. În textul răspunsului, nu emite caractere % sau $ izolate; scrie procentele lipite de număr (de exemplu 25%) și folosește delimitatori LaTeX doar pentru formule complete.

Pentru categoria geometry, identifică figura, punctele/etichetele, segmentele, unghiurile, relațiile de paralelism/perpendicularitate/egalitate și cercurile cerute. Desenul trebuie să conțină numai figura și informațiile geometrice relevante pentru a o reprezenta; nu include calcule, formule de rezolvare, răspunsuri sau detalii fără legătură cu desenul. În câmpul constraints păstrează doar datele geometrice explicite din enunț care nu sunt deja reprezentate de etichete sau marcaje; pentru o figură cerută fără date suplimentare, lasă lista goală. Codifică lungimile și unghiurile cunoscute în etichetele elementelor relevante. Referințele trebuie să indice numai ID-uri declarate. Pentru paralelogram folosește figura parallelogram, exact patru puncte în ordinea conturului și cele patru laturi, fără diagonale dacă nu sunt cerute. Pentru triunghi, pătrat și dreptunghi folosește punctele și laturile în ordinea ciclului conturului. Alege intersecting_lines când sunt două drepte care se intersectează. Marchează un unghi ca drept numai când enunțul spune explicit că măsoară 90° ori că este perpendicular; nu deduce egalități sau perpendicularități doar din tipul figurii. Setează schematic=true când măsurile ori unghiurile exacte lipsesc; nu inventa valori și nu pretinde că desenul este la scară. Fă unghiul de la C explicit prin vertex, ray1 și ray2.

În Fizică, nu folosi categoria geometry pentru diagrame de concepte, vectori, circuite, optică sau mecanică; folosește schematic numai când schema fizică este cerută și poate fi reprezentată corect. Pentru categoria chemistry, emite graful molecular și proprietățile/constrângerile exacte în constraints: fiecare atom o singură dată, fiecare legătură cu ordinul corect, inclusiv ramificațiile și substituenții. Carbonul și hidrogenul implicit trebuie să respecte valența; hidrogenii impliciți nu se trimit ca atomi separați. Verifică numărul de atomi și conectivitatea structurii față de numele/enunțul moleculei. Dacă identificarea moleculei ori conectivitatea este ambiguă, setează diagram=null; nu ghici. Rendererul acceptă molecule neutre cu legături simple, duble și triple formate din C, N, O, P, S, F, Cl, Br și I, inclusiv lanțuri ramificate și molecule cu un singur inel.

Folosește categoria schematic numai pentru explicații vizuale non-geometrice (de exemplu, o schemă de forțe). Coordonatele sunt permise numai aici și trebuie să fie o schiță orientativă. Dacă desenul corect nu poate fi construit din enunț, folosește diagram=null.

În diagramă, include toate câmpurile cerute de schemă. Câmpurile textuale label fără etichetă trebuie să fie șirul gol. În analysis, evaluează exercițiul curent și nu deduce materia doar din selector. Materiile posibile includ Istorie, Geografie și Limba engleză; nivelul olimpiadă se folosește numai când exercițiul indică explicit pregătire pentru olimpiadă. Pentru date insuficiente folosește necunoscut și confidence sub 0.8. Folosește mastery="demonstrated" numai în modul check, după o încercare reală și corectă cu raționament; în celelalte moduri folosește unknown. Nu inventa clasa exactă.`;

const conciseSystemPrompt = systemPrompt.replace(
  /^[\s\S]*?(?=\n\nPentru formule,)/,
  "Ești Elunariq, tutor în română. Adaptează explicațiile la materie, clasă și nivel; respectă programa și temele declarate. Nu ghici informațiile importante: cere clarificări, explică noțiunile necunoscute simplu și tratează scorul mini-quizului doar ca indiciu. Respectă metoda cerută.\n\nRespectă modul cerut: guided oferă un singur pas și o întrebare; hint un indiciu; concept ideea solicitată; example un exemplu; check verifică pasul; practice un exercițiu; summary o recapitulare și un mini-quiz; direct oferă soluția completă doar la cerere. În toate modurile, răspunde clar în cel mult 3–4 pași scurți, fără detalii sau pași nesolicitați.",
);

const diagramRequestTerms = /deseneaz\w*|desen\w*|schiț\w*|schit\w*|diagram\w*|reprezint\w*|ilustreaz\w*|draw\w*|sketch\w*|illustrat\w*/iu;
const geometryFormulaTerms = /\b(?:formul\w*|arie\w*|perimetru\w*|volum\w*|apotem\w*|diagonal\w*|raza|raze|diametru\w*|circumferinț\w*|circumferint\w*|lungim\w*)\b/iu;
const geometryContextTerms = /\b(?:geometr\w*|triunghi\w*|pătrat\w*|patrat\w*|dreptunghi\w*|paralelogram\w*|trapez\w*|cerc\w*|romb\w*|poligon\w*|unghi\w*)\b/iu;
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
  const visualRequest = isVisualRequest(input.question);
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
      if (error instanceof LLMRequestTimeoutError) throw error;
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
  let diagram = parsed.data.diagram;
  if (diagram) {
    const diagramError = validateTutorDiagram(diagram);
    if (diagramError) {
      console.warn("[Tutor] Invalid diagram structure omitted", diagramError);
      diagram = null;
    } else if (diagram.category === "geometry" || diagram.category === "chemistry") {
      diagram = { ...diagram, schematic: true };
    }
  }
  return {
    ...parsed.data,
    diagram,
    title: normalizeTutorTitle(parsed.data.title),
    text: normalizeTutorResponseText(parsed.data.text),
  };
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
      hasAttachment: Boolean(input.attachment || input.attachments?.length),
      visualMode: input.visualMode || input.explanationStyle === "Detaliat și vizual",
    });
    const imageRequested = isImageGenerationRequest(input.question);
    const visualMode = input.visualMode || input.explanationStyle === "Detaliat și vizual";
    const history: Message[] = input.messages.map((message) => ({ role: message.role, content: message.text }));
    const userContent = `Materia: ${input.subject}\nMod: ${input.mode}\nClasa: ${input.schoolGrade ?? "nespecificată"}\nNivel declarat: ${input.learnerLevel ?? "nespecificat"}\nScor mini-quiz inițial (orientativ): ${input.diagnosticScore === undefined ? "indisponibil" : `${input.diagnosticScore}/3`}\nTeme declarate ca studiate: ${input.studiedTopics?.length ? input.studiedTopics.join(", ") : "niciuna declarată; pornește de la noțiunile de bază și verifică ce știe elevul"}\nÎntrebarea elevului: ${input.question || "Analizează enunțul din fișierele atașate și ajută-mă cu primul pas."}`;
    const attachments = [
      ...(input.attachment ? [input.attachment] : []),
      ...(input.attachments ?? []),
    ];
    const contentParts: MessageContent[] = [{ type: "text", text: userContent }];
    for (const attachment of attachments) {
      const dataUrl = `data:${attachment.mimeType};base64,${attachment.base64}`;
      if (attachment.mimeType.startsWith("image/")) {
        contentParts.push(
          { type: "text", text: `Fotografie atașată: ${attachment.name}. Citește enunțul vizibil; dacă nu este lizibil, spune-mi care fotografie trebuie refăcută.` },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        );
      } else if (attachment.mimeType === "application/pdf") {
        contentParts.push(
          { type: "text", text: `Document PDF atașat: ${attachment.name}. Citește enunțul; dacă nu îl poți accesa, spune clar acest lucru.` },
          { type: "file_url", file_url: { url: dataUrl, mime_type: "application/pdf" } },
        );
      } else {
        const decoded = Buffer.from(attachment.base64, "base64").toString("utf8").slice(0, 40_000);
        contentParts.push({ type: "text", text: `Conținutul fișierului ${attachment.name}:\n${decoded}` });
      }
    }
    const modelResult = await invokeTutorWithFallback(selected, async (model) => {
      const result = await invokeLLM({
        model,
        messages: [
          { role: "system", content: `${conciseSystemPrompt}\n\nGenerează diagramă numai dacă întrebarea curentă o cere explicit; în explicația vizuală poate fi utilă doar dacă e exactă, simplă și potrivită clasei. La întrebările despre formule geometrice, nu inventa puncte sau etichete de figură în text și setează diagram=null dacă elevul nu cere explicit desen/diagramă. Folosește doar enunțul curent; nu copia diagrame anterioare. Dacă nu poți valida desenul sau nivelul de detaliu îl face confuz, setează diagram=null și explică printr-un singur pas de text. Pentru vectori folosește săgeți orientate și etichete cerute. În fizică, arată numai elementele și sensurile fizice relevante; nu adăuga calcule în desen. Unghi drept numai pentru 90° explicit. Pentru formule moleculare folosește diagrama chemistry; pentru ecuații stoechiometrice folosește reaction și verifică atomii.\n\nClasa declarată: „${input.schoolGrade ?? "Nu o precizez"}”. Nivel de experiență: „${input.learnerLevel ?? "Îmi formez încrederea"}”. Stil preferat: „${input.explanationStyle ?? "Scurt și clar"}”. Dacă elevul a precizat clasa, adaptează notația, vocabularul și complexitatea desenului la ea; nu introduce conținut din clase superioare decât dacă este cerut. Dacă materia aleasă nu corespunde cerinței, identific-o doar când ești sigur; altfel întreabă.` },
          ...(input.mode === "direct" ? [{
            role: "system" as const,
            content: tutorModeInstruction(input.mode),
          }] : []),
          ...(visualMode ? [{
            role: "system" as const,
            content: "Modul de explicație vizuală este activ. Preferă explicații scurte cu structură vizuală clară; nu genera automat o diagramă. Adaugă cel mult un desen numai dacă cererea îl solicită sau dacă este esențial și îl poți reda exact, corect și potrivit clasei. Dacă există risc de ambiguitate, nu desena și explică un singur pas în text.",
          }] : []),
          ...(input.subject === "Informatică" ? [{
            role: "system" as const,
            content: "Pentru Informatică, predă algoritmi și programare la nivelul școlar cerut: explică ideea înainte de cod, urmărește execuția pas cu pas pe exemple mici și clarifică variabilele, condițiile, buclele, funcțiile și structurile de date când apar. Respectă limbajul de programare cerut de elev; dacă nu este precizat și contează, întreabă înainte să scrii cod. Pentru depanare, indică întâi cauza și un indiciu, iar soluția completă numai când modul sau cererea o solicită. Folosește pseudocod ori o schemă simplă pentru vizualizarea algoritmilor când ajută.",
          }] : []),
          ...history,
          { role: "user", content: attachments.length ? contentParts : userContent },
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
        maxRetries: 0,
      });
      const rawText = contentToText(result.choices?.[0]?.message?.content);
      const parsedResponse = parseTutorResponse(rawText);
      const diagramSubject = parsedResponse.analysis.subject === "necunoscut"
        ? input.subject
        : parsedResponse.analysis.subject;
      const subjectDiagram = shouldOmitGeometryDiagram(diagramSubject, input.question)
        ? undefined
        : diagramForTutorSubject(diagramSubject, parsedResponse.diagram ?? undefined);
      if (parsedResponse.diagram && !subjectDiagram) {
        console.warn("[Tutor] Unrequested diagram omitted for a formula question or science response");
      }
      if (!parsedResponse.text.trim() && !parsedResponse.diagram) {
        throw new Error("Ghidul nu a returnat un răspuns.");
      }
      return { ...parsedResponse, diagram: subjectDiagram ?? null };
    }).catch((error: unknown) => {
      console.error("[Tutor] AI provider request failed", {
        model: selected.model,
        errorName: error instanceof Error ? error.name : "unknown",
        errorMessage: error instanceof Error ? error.message.slice(0, 240) : "unknown",
      });
      throw new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "AI-ul se trezește sau întâmpină o problemă. Așteaptă câteva secunde și încearcă din nou.",
      });
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
      title: tutorResponse.title,
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
