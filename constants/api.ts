import Constants from "expo-constants";
import * as ReactNative from "react-native";
import { DEFAULT_API_BASE_URL } from "@/shared/const";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_BASE_URL =
  extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

/**
 * Get the API base URL, deriving from the current hostname if not configured.
 * Metro runs on 8081, while the local API server runs on 3000.
 */
export function getApiBaseUrl(): string {
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    if (port === "8081") {
      return `${protocol}//${hostname}:3000`;
    }

    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  return "";
}
