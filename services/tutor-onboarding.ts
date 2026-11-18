export type DiagnosticQuestion = {
  question: string;
  options: [string, string, string];
  correctIndex: number;
};

const TOPICS_BY_SUBJECT: Record<string, string[]> = {
  "Matematică": ["Numere și fracții", "Ecuații", "Funcții și grafice", "Geometrie", "Procente și proporții", "Probabilități"],
  "Fizică": ["Mișcare", "Forțe", "Energie", "Electricitate", "Lumină", "Căldură"],
  "Chimie": ["Atomul și elementele", "Tabelul periodic", "Molecule și formule", "Reacții chimice", "Amestecuri și soluții", "Acizi și baze"],
  "Limba română": ["Părți de vorbire", "Părți de propoziție", "Ortografie și punctuație", "Tipuri de texte", "Figuri de stil", "Literatură"],
  "Biologie": ["Celula", "Corpul uman", "Plante", "Animale", "Ecosisteme", "Ereditate"],
  "Informatică": ["Variabile", "Condiții", "Repetiții și bucle", "Liste și tablouri", "Funcții", "Algoritmi"],
  "Istorie": ["Antichitate", "Evul Mediu", "Epoca modernă", "Istoria României", "Războaie și conflicte", "Surse istorice"],
  "Geografie": ["Hărți și orientare", "Relief", "Climă și vreme", "Continente și oceane", "Populație", "România"],
  "Limba engleză": ["Vocabular", "Timpuri verbale", "Pronunție", "Citire și înțelegere", "Scriere", "Conversație"],
};

const QUIZ_BY_SUBJECT: Record<string, DiagnosticQuestion[]> = {
  "Matematică": [
    { question: "Dacă 2x = 10, cât este x?", options: ["8", "5", "12"], correctIndex: 1 },
    { question: "Cât este 25% din 80?", options: ["25", "40", "20"], correctIndex: 2 },
    { question: "Dacă f(x) = x + 2, cât este f(3)?", options: ["5", "6", "3"], correctIndex: 0 },
  ],
  "Fizică": [
    { question: "Un corp parcurge 20 m în 4 s. Care este viteza medie?", options: ["16 m/s", "80 m/s", "5 m/s"], correctIndex: 2 },
    { question: "În ce unitate se măsoară forța?", options: ["Newton", "Joule", "Watt"], correctIndex: 0 },
    { question: "La o viteză mai mare, într-un timp egal, un corp parcurge…", options: ["aceeași distanță", "o distanță mai mare", "o distanță mai mică"], correctIndex: 1 },
  ],
  "Chimie": [
    { question: "Care este formula chimică a apei?", options: ["CO₂", "H₂O", "O₂"], correctIndex: 1 },
    { question: "Care este simbolul chimic al oxigenului?", options: ["O", "Ox", "Og"], correctIndex: 0 },
    { question: "Într-o reacție chimică obișnuită, atomii…", options: ["dispar complet", "se transformă în energie", "se rearanjează"], correctIndex: 2 },
  ],
  "Limba română": [
    { question: "În propoziția «Maria citește», ce fel de cuvânt este «citește»?", options: ["adjectiv", "substantiv", "verb"], correctIndex: 2 },
    { question: "Care este un sinonim potrivit pentru «vesel»?", options: ["bucuros", "obosit", "tăcut"], correctIndex: 0 },
    { question: "Cuvântul «copiii» este la…", options: ["singular", "plural", "viitor"], correctIndex: 1 },
  ],
  "Biologie": [
    { question: "Ce organ pompează sângele în corp?", options: ["stomacul", "inima", "plămânul"], correctIndex: 1 },
    { question: "Cum se numește procesul prin care plantele folosesc lumina pentru a-și produce hrana?", options: ["respirație", "digestie", "fotosinteză"], correctIndex: 2 },
    { question: "Care este unitatea de bază a organismelor vii?", options: ["celula", "țesutul", "organul"], correctIndex: 0 },
  ],
  "Informatică": [
    { question: "Dacă n = 2 și apoi n = n + 3, ce valoare are n?", options: ["5", "3", "6"], correctIndex: 0 },
    { question: "La ce folosește o condiție «dacă» într-un program?", options: ["șterge programul", "alege ce instrucțiuni se execută", "afișează mereu aceeași imagine"], correctIndex: 1 },
    { question: "Ce face o buclă într-un program?", options: ["oprește calculatorul", "redenumește fișierul", "repetă instrucțiuni"], correctIndex: 2 },
  ],
  "Istorie": [
    { question: "Ce este o cronologie?", options: ["o listă de formule", "o hartă a vremii", "o așezare a evenimentelor în timp"], correctIndex: 2 },
    { question: "Care eveniment a avut loc mai întâi?", options: ["începutul celui de-al Doilea Război Mondial, în 1939", "Marea Unire din 1918", "au avut loc în același an"], correctIndex: 1 },
    { question: "Care dintre acestea poate fi o sursă istorică?", options: ["un document vechi", "o prognoză meteo", "o ecuație"], correctIndex: 0 },
  ],
  "Geografie": [
    { question: "Ce emisfere desparte Ecuatorul?", options: ["Nordică și sudică", "Estică și vestică", "Uscată și umedă"], correctIndex: 0 },
    { question: "Ce instrument te ajută să găsești punctele cardinale?", options: ["termometrul", "cronometru", "busola"], correctIndex: 2 },
    { question: "Ce arată scara unei hărți?", options: ["altitudinea norilor", "legătura dintre distanța de pe hartă și cea reală", "temperatura unei regiuni"], correctIndex: 1 },
  ],
  "Limba engleză": [
    { question: "Completează: «I ___ to school every day.»", options: ["goes", "go", "went"], correctIndex: 1 },
    { question: "Care este forma de trecut a verbului «go»?", options: ["goed", "going", "went"], correctIndex: 2 },
    { question: "Ce exprimă cuvântul «because»?", options: ["un motiv", "o culoare", "o întrebare despre loc"], correctIndex: 0 },
  ],
};

export function getSuggestedTopics(subject: string): string[] {
  return TOPICS_BY_SUBJECT[subject] ?? [];
}

export function getDiagnosticQuestions(subject: string): DiagnosticQuestion[] {
  return QUIZ_BY_SUBJECT[subject] ?? QUIZ_BY_SUBJECT["Matematică"];
}

export function parseAdditionalTopics(value: string): string[] {
  return [...new Set(value.split(",").map((topic) => topic.trim()).filter(Boolean))].slice(0, 10);
}
