import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  learnerStateSchema,
  removeQuestionGeneratedLessons,
  type LearnerState,
} from "@/shared/learning";
import { DEFAULT_PREFERENCES, loadPreferences } from "@/lib/storage";

const STORAGE_PREFIX = "elunariq.learner-state.v1";

export const DEFAULT_LEARNER_STATE: LearnerState = {
  preferences: DEFAULT_PREFERENCES,
  questionsAsked: 0,
  questionDays: [],
  questionActivity: [],
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
      const parsed = learnerStateSchema.safeParse(JSON.parse(serialized));
      if (parsed.success) return removeQuestionGeneratedLessons(parsed.data);
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
