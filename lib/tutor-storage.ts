import AsyncStorage from "@react-native-async-storage/async-storage";
import { z } from "zod";
import { tutorDiagramSchema } from "../shared/tutor-diagram";
import type { TutorMessage } from "../services/ai-service";

const STORAGE_KEY = "elunariq.tutor-messages.v1";
const SESSION_ID_KEY = "elunariq.tutor-session-id.v1";
const SAVED_LESSONS_KEY = "elunariq.saved-tutor-lessons.v1";
const tutorMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  text: z.string().max(8000),
  mode: z.enum(["guided", "hint", "concept", "example", "check", "practice", "summary", "direct"]).optional(),
  createdAt: z.number(),
  provider: z.literal("live").optional(),
  model: z.string().optional(),
  diagram: tutorDiagramSchema.optional(),
  imageUrl: z.string().optional(),
  imageError: z.string().optional(),
  analysis: z.object({
    subject: z.enum(["Matematică", "Fizică", "Chimie", "Limba română", "Biologie", "Informatică", "Istorie", "Geografie", "Limba engleză", "necunoscut"]),
    schoolLevel: z.enum(["gimnaziu", "liceu", "olimpiada", "necunoscut"]),
    difficulty: z.enum(["ușor", "mediu", "dificil", "necunoscut"]),
    confidence: z.number().min(0).max(1),
    mastery: z.enum(["demonstrated", "not_yet", "unknown"]),
  }).optional(),
}).strict();
const tutorMessagesSchema = z.array(tutorMessageSchema).max(100);
const savedTutorLessonSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  title: z.string().min(1).max(200),
  subject: z.string().min(1).max(80),
  savedAt: z.string().datetime(),
  messages: tutorMessagesSchema,
}).strict();
export type SavedTutorLesson = z.infer<typeof savedTutorLessonSchema>;
const savedTutorLessonsSchema = z.array(savedTutorLessonSchema).max(50);

export async function loadTutorMessages(): Promise<TutorMessage[]> {
  try {
    const serialized = await AsyncStorage.getItem(STORAGE_KEY);
    if (!serialized) return [];
    const parsed = tutorMessagesSchema.safeParse(JSON.parse(serialized));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export async function saveTutorMessages(messages: TutorMessage[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(messages.slice(-100)),
    );
  } catch {
    // Keep the conversation available in memory if device storage is unavailable.
  }
}

export async function loadTutorSessionId(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(SESSION_ID_KEY)) || null;
  } catch {
    return null;
  }
}

export async function saveTutorSessionId(sessionId: string): Promise<void> {
  await AsyncStorage.setItem(SESSION_ID_KEY, sessionId);
}

function deduplicateLessons(lessons: SavedTutorLesson[]): SavedTutorLesson[] {
  const seenSessions = new Set<string>();
  const seenMessageLists = new Set<string>();
  return lessons.filter((lesson) => {
    const sessionId = lesson.sessionId ?? lesson.id;
    const messageList = lesson.messages.map((message) => message.id).join(",");
    if (
      seenSessions.has(sessionId) ||
      (messageList.length > 0 && seenMessageLists.has(messageList))
    ) {
      return false;
    }
    seenSessions.add(sessionId);
    if (messageList) seenMessageLists.add(messageList);
    return true;
  });
}

export async function loadSavedTutorLessons(): Promise<SavedTutorLesson[]> {
  try {
    const serialized = await AsyncStorage.getItem(SAVED_LESSONS_KEY);
    if (!serialized) return [];
    const parsed = savedTutorLessonsSchema.safeParse(JSON.parse(serialized));
    if (!parsed.success) return [];
    const lessons = deduplicateLessons(parsed.data);
    if (lessons.length !== parsed.data.length) {
      await AsyncStorage.setItem(SAVED_LESSONS_KEY, JSON.stringify(lessons));
    }
    return lessons;
  } catch {
    return [];
  }
}

export async function loadSavedTutorLesson(
  id: string,
): Promise<SavedTutorLesson | null> {
  return (await loadSavedTutorLessons()).find((lesson) => lesson.id === id) ?? null;
}

export async function saveTutorLesson(
  sessionId: string,
  subject: string,
  messages: TutorMessage[],
): Promise<SavedTutorLesson> {
  const lessonMessages = messages.filter(
    (message) => message.id !== "welcome" && message.text.trim(),
  );
  if (!lessonMessages.some((message) => message.role === "user")) {
    throw new Error("Trimite mai întâi o întrebare pentru a salva lecția.");
  }
  const firstQuestion = lessonMessages.find((message) => message.role === "user")?.text;
  const lesson = savedTutorLessonSchema.parse({
    id: sessionId,
    sessionId,
    title: (firstQuestion ?? subject).slice(0, 200),
    subject,
    savedAt: new Date().toISOString(),
    messages: lessonMessages.slice(-100),
  });
  const existing = await loadSavedTutorLessons();
  const uniqueExisting = existing.filter(
    (item) => item.id !== sessionId && item.sessionId !== sessionId,
  );
  await AsyncStorage.setItem(
    SAVED_LESSONS_KEY,
    JSON.stringify([lesson, ...uniqueExisting].slice(0, 50)),
  );
  return lesson;
}
