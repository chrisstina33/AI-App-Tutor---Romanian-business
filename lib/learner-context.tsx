import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEMO_LESSONS } from "@/lib/app-data";
import {
  DEFAULT_LEARNER_STATE,
  loadLearnerState,
  saveLearnerState,
} from "@/lib/learner-storage";
import type { LearnerState } from "@/shared/learning";
import type { Preferences } from "@/lib/storage";

type LearnerContextValue = {
  state: LearnerState;
  loading: boolean;
  updatePreferences: (patch: Partial<Preferences>) => void;
  recordTutorQuestion: (subject: string) => void;
};

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerDataProvider({ children }: { children: React.ReactNode }) {
  const stateRef = useRef<LearnerState>(DEFAULT_LEARNER_STATE);
  const [state, setState] = useState<LearnerState>(DEFAULT_LEARNER_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadLearnerState("anonymous").then((saved) => {
      if (cancelled) return;
      stateRef.current = saved;
      setState(saved);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const replaceLocalState = useCallback(
    (next: LearnerState) => {
      stateRef.current = next;
      setState(next);
      void saveLearnerState("anonymous", next);
    },
    [],
  );

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      replaceLocalState({
        ...stateRef.current,
        preferences: { ...stateRef.current.preferences, ...patch },
      });
    },
    [replaceLocalState],
  );

  const recordTutorQuestion = useCallback(
    (subject: string) => {
      const normalizedSubject = subject.trim() || "Materie";
      const id = `tutor-${normalizedSubject
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}`;
      const now = new Date().toISOString();
      const existing = stateRef.current.lessonActivity.find(
        (lesson) => lesson.id === id,
      );
      const title =
        DEMO_LESSONS.find((lesson) => lesson.subject === normalizedSubject)
          ?.title ?? `${normalizedSubject}: sesiune cu tutorul`;
      const lesson = {
        id,
        title,
        subject: normalizedSubject,
        questionCount: (existing?.questionCount ?? 0) + 1,
        lastStudiedAt: now,
      };

      replaceLocalState({
        ...stateRef.current,
        questionsAsked: stateRef.current.questionsAsked + 1,
        lessonActivity: [
          lesson,
          ...stateRef.current.lessonActivity.filter((item) => item.id !== id),
        ].slice(0, 100),
      });
    },
    [replaceLocalState],
  );

  const value = useMemo(
    () => ({ state, loading, updatePreferences, recordTutorQuestion }),
    [state, loading, updatePreferences, recordTutorQuestion],
  );

  return (
    <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>
  );
}

export function useLearnerData(): LearnerContextValue {
  const context = useContext(LearnerContext);
  if (!context) {
    throw new Error("useLearnerData must be used within LearnerDataProvider");
  }
  return context;
}
