import { describe, expect, it } from "vitest";
import {
  learnerStateSchema,
  recordLearnerQuestion,
  removeQuestionGeneratedLessons,
} from "../shared/learning";
import { recommendSubject, SUBJECTS } from "../lib/app-data";

const initialState = learnerStateSchema.parse({
  preferences: {
    displayName: "Elev",
    level: "Îmi formez încrederea",
    explanationStyle: "Scurt și clar",
    preferredSubjects: [],
  },
  questionsAsked: 0,
  savedLessons: [],
  lessonActivity: [],
});

describe("learner question and lesson tracking", () => {
  it("recommends the least practiced preferred subject and falls back to all subjects", () => {
    expect(recommendSubject(["physics", "math"], [
      { subject: "Matematică", questionCount: 2 },
      { subject: "Fizică", questionCount: 5 },
    ])).toMatchObject({ id: "math" });
    expect(recommendSubject([], [])).toEqual(SUBJECTS[0]);
  });

  it("defaults the school grade for legacy local and server learner states", () => {
    expect(initialState.preferences.schoolGrade).toBe("Nu o precizez");
    expect(initialState.preferences.studiedTopics).toEqual([]);
    expect(initialState.preferences.studiedTopicsSubject).toBe("");
    expect(initialState.preferences.diagnosticScore).toBe(0);
    expect(initialState.preferences.diagnosticSubject).toBe("");
    expect(initialState.preferences.tutorSetupComplete).toBe(false);
    expect(SUBJECTS).toHaveLength(9);
  });

  it("counts questions separately without creating lessons", () => {
    const updated = recordLearnerQuestion(initialState, " Matematică ", "2026-11-16T12:00:00.000Z");

    expect(updated.questionsAsked).toBe(1);
    expect(updated.questionDays).toEqual(["2026-11-16"]);
    expect(updated.questionActivity).toEqual([
      { subject: "Matematică", questionCount: 1, lastAskedAt: "2026-11-16T12:00:00.000Z" },
    ]);
    expect(updated.lessonActivity).toEqual([]);
  });

  it("migrates old question-generated lesson rows into question activity", () => {
    const state = learnerStateSchema.parse({
      ...initialState,
      lessonActivity: [
        {
          id: "tutor-matematica-paralelogram",
          title: "Matematică: Desenează un paralelogram",
          subject: "Matematică",
          questionCount: 2,
          lastStudiedAt: "2026-11-16T12:00:00.000Z",
        },
        {
          id: "saved-lesson-1",
          title: "Ecuații de gradul al doilea",
          subject: "Matematică",
          questionCount: 1,
          lastStudiedAt: "2026-11-15T12:00:00.000Z",
        },
      ],
    });

    const migrated = removeQuestionGeneratedLessons(state);
    expect(migrated.lessonActivity.map((lesson) => lesson.id)).toEqual(["saved-lesson-1"]);
    expect(migrated.questionActivity).toEqual([
      { subject: "Matematică", questionCount: 2, lastAskedAt: "2026-11-16T12:00:00.000Z" },
    ]);
    expect(migrated.questionDays).toEqual(["2026-11-16"]);
    expect(removeQuestionGeneratedLessons(migrated)).toEqual(migrated);
  });
});
