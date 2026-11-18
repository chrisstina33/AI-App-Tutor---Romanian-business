import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = { preferences: "elunariq.preferences.v1", completedExercises: "elunariq.completed-exercises.v1", savedLessons: "elunariq.saved-lessons.v1", pendingUpload: "elunariq.pending-upload.v1", pendingUploads: "elunariq.pending-uploads.v1" } as const;
export type SchoolGrade = "Nu o precizez" | "Clasa a V-a" | "Clasa a VI-a" | "Clasa a VII-a" | "Clasa a VIII-a" | "Clasa a IX-a" | "Clasa a X-a" | "Clasa a XI-a" | "Clasa a XII-a";
export type Preferences = { displayName: string; schoolGrade: SchoolGrade; level: "La început" | "Îmi formez încrederea" | "Pregătit pentru examen"; explanationStyle: "Scurt și clar" | "Detaliat și vizual" | "Întrebări socratice"; preferredSubjects: string[] };
export type PendingUpload = { name: string; uri: string; mimeType?: string; size?: number; status: "selected" | "ready" };
export const DEFAULT_PREFERENCES: Preferences = { displayName: "Elev", schoolGrade: "Nu o precizez", level: "Îmi formez încrederea", explanationStyle: "Scurt și clar", preferredSubjects: ["math", "physics"] };
async function readJson<T>(key: string, fallback: T): Promise<T> { try { const value = await AsyncStorage.getItem(key); return value ? (JSON.parse(value) as T) : fallback; } catch { return fallback; } }
async function writeJson<T>(key: string, value: T): Promise<void> { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch { /* UI continues in memory. */ } }
export async function loadPreferences(): Promise<Preferences> {
  const saved = await readJson<Partial<Preferences>>(STORAGE_KEYS.preferences, {});
  return { ...DEFAULT_PREFERENCES, ...saved };
}
export function savePreferences(preferences: Preferences): Promise<void> { return writeJson(STORAGE_KEYS.preferences, preferences); }
export function loadCompletedExercises(): Promise<number> { return readJson(STORAGE_KEYS.completedExercises, 0); }
export function saveCompletedExercises(value: number): Promise<void> { return writeJson(STORAGE_KEYS.completedExercises, value); }
export function loadSavedLessons(): Promise<string[]> { return readJson(STORAGE_KEYS.savedLessons, []); }
export function saveSavedLessons(value: string[]): Promise<void> { return writeJson(STORAGE_KEYS.savedLessons, value); }
export function loadPendingUpload(): Promise<PendingUpload | null> { return readJson<PendingUpload | null>(STORAGE_KEYS.pendingUpload, null); }
export function savePendingUpload(value: PendingUpload): Promise<void> { return writeJson(STORAGE_KEYS.pendingUpload, value); }
export async function clearPendingUpload(): Promise<void> { try { await AsyncStorage.removeItem(STORAGE_KEYS.pendingUpload); } catch { /* No-op fallback. */ } }
export async function loadPendingUploads(): Promise<PendingUpload[]> {
  const uploads = await readJson<PendingUpload[]>(STORAGE_KEYS.pendingUploads, []);
  if (uploads.length) return uploads;
  const legacyUpload = await loadPendingUpload();
  return legacyUpload ? [legacyUpload] : [];
}
export async function savePendingUploads(value: PendingUpload[]): Promise<void> {
  await writeJson(STORAGE_KEYS.pendingUploads, value);
  await clearPendingUpload();
}
export async function clearPendingUploads(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STORAGE_KEYS.pendingUploads, STORAGE_KEYS.pendingUpload]);
  } catch {
    await clearPendingUpload();
  }
}
