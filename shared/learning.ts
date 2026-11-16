import { z } from "zod";

export const learnerStateSchema = z.object({
  preferences: z.object({
    displayName: z.string().trim().min(1).max(80),
    level: z.enum([
      "La început",
      "Îmi formez încrederea",
      "Pregătit pentru examen",
    ]),
    explanationStyle: z.enum([
      "Scurt și clar",
      "Detaliat și vizual",
      "Întrebări socratice",
    ]),
    preferredSubjects: z.array(z.string().max(40)).max(12),
  }),
  questionsAsked: z.number().int().min(0).max(1_000_000),
  questionDays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(365).default([]),
  questionActivity: z.array(z.object({
    subject: z.string().min(1).max(80),
    questionCount: z.number().int().min(0).max(1_000_000),
    lastAskedAt: z.string().min(1).max(40),
  })).max(100).default([]),
  savedLessons: z.array(z.string().max(80)).max(100),
  lessonActivity: z
    .array(
      z.object({
        id: z.string().min(1).max(80),
        title: z.string().min(1).max(200),
        subject: z.string().min(1).max(80),
        questionCount: z.number().int().min(0).max(1_000_000),
        lastStudiedAt: z.string().min(1).max(40),
      }),
    )
    .max(100),
});

export type LearnerState = z.infer<typeof learnerStateSchema>;

function localDay(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function recordLearnerQuestion(
  state: LearnerState,
  subject: string,
  lastAskedAt = new Date().toISOString(),
): LearnerState {
  const normalizedSubject = subject.trim() || "Materie";
  const existing = state.questionActivity.find((item) => item.subject === normalizedSubject);
  const day = localDay(lastAskedAt);
  const questionDays = day ? [...new Set([...state.questionDays, day])].sort().slice(-365) : state.questionDays;
  return {
    ...state,
    questionsAsked: state.questionsAsked + 1,
    questionDays,
    questionActivity: [
      {
        subject: normalizedSubject,
        questionCount: (existing?.questionCount ?? 0) + 1,
        lastAskedAt,
      },
      ...state.questionActivity.filter((item) => item.subject !== normalizedSubject),
    ].slice(0, 100),
  };
}

export function removeQuestionGeneratedLessons(state: LearnerState): LearnerState {
  const generatedLessons = state.lessonActivity.filter((lesson) => lesson.id.startsWith("tutor-"));
  if (!generatedLessons.length) return state;

  const migratedQuestions = new Map<string, { questionCount: number; lastAskedAt: string }>();
  const questionDays = new Set(state.questionDays);
  for (const lesson of generatedLessons) {
    const day = localDay(lesson.lastStudiedAt);
    if (day) questionDays.add(day);
    const current = migratedQuestions.get(lesson.subject);
    migratedQuestions.set(lesson.subject, {
      questionCount: (current?.questionCount ?? 0) + lesson.questionCount,
      lastAskedAt: !current || lesson.lastStudiedAt > current.lastAskedAt
        ? lesson.lastStudiedAt
        : current.lastAskedAt,
    });
  }

  const questionActivity = [...state.questionActivity];
  for (const [subject, migrated] of migratedQuestions) {
    const existing = questionActivity.find((item) => item.subject === subject);
    const combined = {
      subject,
      questionCount: Math.max(existing?.questionCount ?? 0, migrated.questionCount),
      lastAskedAt: !existing || migrated.lastAskedAt > existing.lastAskedAt
        ? migrated.lastAskedAt
        : existing.lastAskedAt,
    };
    const otherQuestions = questionActivity.filter((item) => item.subject !== subject);
    questionActivity.splice(0, questionActivity.length, combined, ...otherQuestions);
  }

  return {
    ...state,
    questionDays: [...questionDays].sort().slice(-365),
    questionActivity: questionActivity.slice(0, 100),
    lessonActivity: state.lessonActivity.filter((lesson) => !lesson.id.startsWith("tutor-")),
  };
}

export const learnerSnapshotSchema = z.object({
  state: learnerStateSchema,
  updatedAt: z.string().min(1),
});

export type LearnerSnapshot = z.infer<typeof learnerSnapshotSchema>;
