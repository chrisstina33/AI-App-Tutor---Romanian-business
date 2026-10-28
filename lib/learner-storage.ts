import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LearnerState } from "@/shared/learning";
import { DEFAULT_PREFERENCES, loadPreferences } from "@/lib/storage";

const STORAGE_PREFIX = "elunariq.learner-state.v1";

export const DEFAULT_LEARNER_STATE: LearnerState = {
  preferences: DEFAULT_PREFERENCES,
  questionsAsked: 0,
  savedLessons: [],
  lessonActivity: [],
};

export function getLearnerStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}.${encodeURIComponent(scope)}`;
}

export async function loadLearnerState(scope: string): Promise<LearnerState> {
  try {
    const serialized = await AsyncStorage.getItem(getLearnerStorageKey(scope));
    if (serialized) {
      const parsed: unknown = JSON.parse(serialized);
      if (isLearnerState(parsed)) return parsed;
    }
  } catch {
    // Keep the learner flow usable if device storage is temporarily unavailable.
  }

  if (scope === "anonymous") {
    try {
      return {
        ...DEFAULT_LEARNER_STATE,
        preferences: await loadPreferences(),
      };
    } catch {
      // Fall through to the clean defaults.
    }
  }

  return DEFAULT_LEARNER_STATE;
}

export async function saveLearnerState(
  scope: string,
  state: LearnerState,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      getLearnerStorageKey(scope),
      JSON.stringify(state),
    );
  } catch {
    // The caller still updates the in-memory state if storage is unavailable.
  }
}

export function hasLearnerActivity(state: LearnerState): boolean {
  return (
    state.questionsAsked > 0 ||
    state.lessonActivity.length > 0 ||
    state.savedLessons.length > 0
  );
}

function isLearnerState(value: unknown): value is LearnerState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<LearnerState>;
  return (
    typeof state.questionsAsked === "number" &&
    Array.isArray(state.lessonActivity) &&
    Array.isArray(state.savedLessons) &&
    Boolean(state.preferences)
  );
}
