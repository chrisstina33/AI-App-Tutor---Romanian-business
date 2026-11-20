import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSavedTutorLesson,
  loadSavedTutorLessons,
  loadTutorChats,
  loadTutorMessages,
  renameTutorChat,
  deleteTutorChat,
  saveTutorChat,
  saveTutorLesson,
  saveTutorMessages,
} from "../lib/tutor-storage";
import type { TutorMessage } from "../services/ai-service";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: (key: string) => Promise.resolve(storage.get(key) ?? null),
    setItem: (key: string, value: string) => {
      storage.set(key, value);
      return Promise.resolve();
    },
  },
}));

beforeEach(() => storage.clear());

describe("on-device tutor lesson storage", () => {
  it("restores a conversation without requiring an account", async () => {
    const messages: TutorMessage[] = [
      { id: "question-1", role: "user", text: "Cum rezolv 2x = 8?", createdAt: 1 },
      { id: "answer-1", role: "assistant", text: "Care este primul pas?", createdAt: 2 },
    ];

    await saveTutorMessages(messages);

    expect(await loadTutorMessages()).toEqual(messages);
  });

  it("ignores invalid stored conversation data", async () => {
    storage.set("elunariq.tutor-messages.v1", JSON.stringify([{ role: "unknown" }]));

    expect(await loadTutorMessages()).toEqual([]);
  });

  it("saves a named subject lesson for later organization and resuming", async () => {
    const messages: TutorMessage[] = [
      { id: "question-1", role: "user", text: "Ecuația 2x = 8", createdAt: 1 },
      { id: "answer-1", role: "assistant", text: "Împarte ambii membri la 2.", createdAt: 2 },
    ];

    const lesson = await saveTutorLesson("session-1", "Matematică", messages);

    expect(lesson.title).toBe("Ecuația 2x = 8");
    expect(lesson.subject).toBe("Matematică");
    expect(lesson.id).toBe("session-1");
    expect(lesson.sessionId).toBe("session-1");
    expect(await loadSavedTutorLesson(lesson.id)).toEqual(lesson);
    expect(await loadSavedTutorLessons()).toEqual([lesson]);
  });

  it("uses the generated conversation title for the saved lesson", async () => {
    const messages: TutorMessage[] = [
      { id: "question-1", role: "user", text: "Ce este o fracție?", createdAt: 1 },
      { id: "answer-1", role: "assistant", text: "O parte dintr-un întreg.", title: "Înțelegerea fracțiilor", createdAt: 2 },
    ];

    const lesson = await saveTutorLesson(
      "session-1",
      "Matematică",
      messages,
      messages[1].title,
    );

    expect(lesson.title).toBe("Înțelegerea fracțiilor");
  });

  it("updates an existing lesson for the same chat session", async () => {
    const original: TutorMessage[] = [
      { id: "question-1", role: "user", text: "Ecuația 2x = 8", createdAt: 1 },
      { id: "answer-1", role: "assistant", text: "Împarte la 2.", createdAt: 2 },
    ];
    const updated: TutorMessage[] = [
      ...original,
      { id: "question-2", role: "user", text: "De ce?", createdAt: 3 },
    ];

    await saveTutorLesson("session-1", "Matematică", original);
    await saveTutorLesson("session-1", "Matematică", updated);

    const lessons = await loadSavedTutorLessons();
    expect(lessons).toHaveLength(1);
    expect(lessons[0].messages).toEqual(updated);
  });

  it("deduplicates legacy lessons with the same conversation on load", async () => {
    const lesson = {
      id: "legacy-1",
      title: "Ecuația 2x = 8",
      subject: "Matematică",
      savedAt: new Date().toISOString(),
      messages: [
        { id: "question-1", role: "user", text: "Ecuația 2x = 8", createdAt: 1 },
      ],
    };
    storage.set(
      "elunariq.saved-tutor-lessons.v1",
      JSON.stringify([{ ...lesson }, { ...lesson, id: "legacy-2" }]),
    );

    expect(await loadSavedTutorLessons()).toHaveLength(1);
  });

  it("stores, renames, and deletes independent local tutor chats", async () => {
    const first = {
      id: "session-1",
      title: "Ecuații",
      subject: "Matematică",
      updatedAt: new Date().toISOString(),
      messages: [
        { id: "question-1", role: "user" as const, text: "Cum rezolv 2x = 8?", createdAt: 1 },
      ],
    };
    const second = {
      ...first,
      id: "session-2",
      title: "Forțe",
      subject: "Fizică",
    };

    await saveTutorChat(first);
    await saveTutorChat(second);
    await renameTutorChat("session-1", "Ecuații liniare");

    expect((await loadTutorChats()).map((chat) => chat.title)).toEqual(
      expect.arrayContaining(["Forțe", "Ecuații liniare"]),
    );
    expect((await deleteTutorChat("session-2")).map((chat) => chat.id)).toEqual([
      "session-1",
    ]);
  });
});
