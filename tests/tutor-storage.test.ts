import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadSavedTutorLesson,
  loadSavedTutorLessons,
  loadTutorMessages,
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

    const lesson = await saveTutorLesson("Matematică", messages);

    expect(lesson.title).toBe("Ecuația 2x = 8");
    expect(lesson.subject).toBe("Matematică");
    expect(await loadSavedTutorLesson(lesson.id)).toEqual(lesson);
    expect(await loadSavedTutorLessons()).toEqual([lesson]);
  });
});
