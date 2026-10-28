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
  hasLearnerActivity,
  loadLearnerState,
  saveLearnerState,
} from "@/lib/learner-storage";
import type { LearnerState } from "@/shared/learning";
import { trpc } from "@/lib/trpc";
import type { Preferences } from "@/lib/storage";

type SyncStatus = "local" | "syncing" | "synced" | "offline";

type LearnerContextValue = {
  state: LearnerState;
  loading: boolean;
  syncStatus: SyncStatus;
  updatePreferences: (patch: Partial<Preferences>) => void;
  recordTutorQuestion: (subject: string) => void;
};

const LearnerContext = createContext<LearnerContextValue | null>(null);

export function LearnerDataProvider({ children }: { children: React.ReactNode }) {
  const utils = trpc.useUtils();
  const authQuery = trpc.auth.me.useQuery(undefined, {
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
  const user = authQuery.data ?? null;
  const openId = user?.openId ?? null;
  const scope = openId ? `user:${openId}` : "anonymous";
  const remoteQuery = trpc.learning.getState.useQuery(
    { openId: openId ?? "" },
    {
      enabled: Boolean(openId),
      refetchInterval: openId ? 15_000 : false,
      refetchOnWindowFocus: true,
      retry: false,
    },
  );
  const saveMutation = trpc.learning.saveState.useMutation();
  const saveMutationRef = useRef(saveMutation.mutateAsync);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const appliedRemoteAt = useRef("");
  const seededAccount = useRef("");
  const activeOpenId = useRef<string | null>(openId);
  const stateRef = useRef<LearnerState>(DEFAULT_LEARNER_STATE);
  const [state, setState] = useState<LearnerState>(DEFAULT_LEARNER_STATE);
  const [loading, setLoading] = useState(true);
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");

  activeOpenId.current = openId;

  useEffect(() => {
    saveMutationRef.current = saveMutation.mutateAsync;
  }, [saveMutation.mutateAsync]);

  useEffect(() => {
    if (authQuery.isLoading) return;
    let cancelled = false;
    setLoading(true);
    setScopeLoaded(false);
    setSyncStatus(openId ? "syncing" : "local");
    appliedRemoteAt.current = "";

    void loadLearnerState(scope).then((saved) => {
      if (cancelled) return;
      stateRef.current = saved;
      setState(saved);
      setScopeLoaded(true);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [authQuery.isLoading, openId, scope]);

  const replaceLocalState = useCallback(
    (next: LearnerState) => {
      stateRef.current = next;
      setState(next);
      void saveLearnerState(scope, next);
    },
    [scope],
  );

  const commit = useCallback(
    (next: LearnerState) => {
      stateRef.current = next;
      setState(next);
      void saveLearnerState(scope, next);

      if (!openId) {
        setSyncStatus("local");
        return;
      }

      setSyncStatus("syncing");
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(async () => {
          const saved = await saveMutationRef.current({ state: next });
          utils.learning.getState.setData({ openId }, saved);
          if (activeOpenId.current === openId) setSyncStatus("synced");
        })
        .catch(() => {
          if (activeOpenId.current === openId) setSyncStatus("offline");
        });
    },
    [openId, scope, utils],
  );

  useEffect(() => {
    if (!openId || !scopeLoaded || remoteQuery.isLoading) return;
    if (remoteQuery.isError) {
      setSyncStatus("offline");
      return;
    }

    const snapshot = remoteQuery.data;
    if (snapshot) {
      if (snapshot.updatedAt !== appliedRemoteAt.current) {
        appliedRemoteAt.current = snapshot.updatedAt;
        replaceLocalState(snapshot.state);
      }
      setSyncStatus("synced");
      return;
    }

    if (seededAccount.current === openId) return;
    seededAccount.current = openId;
    void (async () => {
      const accountLocal = stateRef.current;
      const anonymousLocal = await loadLearnerState("anonymous");
      if (activeOpenId.current !== openId) return;
      const initial = hasLearnerActivity(accountLocal)
        ? accountLocal
        : anonymousLocal;
      commit(initial);
    })();
  }, [
    commit,
    openId,
    remoteQuery.data,
    remoteQuery.isError,
    remoteQuery.isLoading,
    replaceLocalState,
    scopeLoaded,
  ]);

  const updatePreferences = useCallback(
    (patch: Partial<Preferences>) => {
      commit({
        ...stateRef.current,
        preferences: { ...stateRef.current.preferences, ...patch },
      });
    },
    [commit],
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

      commit({
        ...stateRef.current,
        questionsAsked: stateRef.current.questionsAsked + 1,
        lessonActivity: [
          lesson,
          ...stateRef.current.lessonActivity.filter((item) => item.id !== id),
        ].slice(0, 100),
      });
    },
    [commit],
  );

  const value = useMemo(
    () => ({ state, loading, syncStatus, updatePreferences, recordTutorQuestion }),
    [state, loading, syncStatus, updatePreferences, recordTutorQuestion],
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
