import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_LEARNER_STATE,
  loadLearnerState,
  saveLearnerState,
} from "@/lib/learner-storage";
import {
  learnerStateSchema,
  recordLearnerQuestion,
  removeQuestionGeneratedLessons,
  type LearnerState,
} from "@/shared/learning";
import type { Preferences } from "@/lib/storage";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

type LearnerContextValue = {
  state: LearnerState;
  loading: boolean;
  updatePreferences: (patch: Partial<Preferences>) => void;
  recordQuestion: (subject: string) => void;
};

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const scope = user?.accountType === "student" ? `user-${user.id}` : "anonymous";
  const remoteState = trpc.auth.myLearnerState.useQuery(undefined, { enabled: user?.accountType === "student", retry: false });
  const syncState = trpc.auth.syncLearnerState.useMutation();
  const syncLearnerState = syncState.mutate;
  const stateRef = useRef<LearnerState>(DEFAULT_LEARNER_STATE);
  const [state, setState] = useState<LearnerState>(DEFAULT_LEARNER_STATE);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const loading = loadedScope !== scope;

  useEffect(() => {
    let cancelled = false;
    if (user?.accountType === "student" && !remoteState.isFetched) return;
    void loadLearnerState(scope).then(async (local) => {
      let saved = local;
      if (scope !== "anonymous" && remoteState.data?.state) {
        saved = removeQuestionGeneratedLessons(
          learnerStateSchema.parse(remoteState.data.state),
        );
      } else if (scope !== "anonymous" && !local.questionsAsked && !local.lessonActivity.length) {
        saved = await loadLearnerState("anonymous");
      }
      if (cancelled) return;
      stateRef.current = saved;
      setState(saved);
      setLoadedScope(scope);
    });

    return () => {
      cancelled = true;
    };
  }, [scope, remoteState.data, remoteState.isFetched, user?.accountType]);

  const replaceLocalState = useCallback(
    (next: LearnerState) => {
      stateRef.current = next;
      setState(next);
      void saveLearnerState(scope, next);
    },
    [scope],
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

  const recordQuestion = useCallback(
    (subject: string) => {
      replaceLocalState(recordLearnerQuestion(stateRef.current, subject));
    },
    [replaceLocalState],
  );

  const value = useMemo(
    () => ({ state, loading, updatePreferences, recordQuestion }),
    [state, loading, updatePreferences, recordQuestion],
  );

  useEffect(() => {
    if (user?.accountType === "student" && remoteState.isFetched && !loading) syncLearnerState(state);
  }, [user?.id, user?.accountType, remoteState.isFetched, loading, state, syncLearnerState]);

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
