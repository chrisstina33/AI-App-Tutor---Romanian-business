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

export const learnerSnapshotSchema = z.object({
  state: learnerStateSchema,
  updatedAt: z.string().min(1),
});

export type LearnerSnapshot = z.infer<typeof learnerSnapshotSchema>;
