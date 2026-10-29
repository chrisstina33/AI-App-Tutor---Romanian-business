import * as Linking from "expo-linking";
import Constants from "expo-constants";
import * as ReactNative from "react-native";
import { DEFAULT_API_BASE_URL } from "@/shared/const";

// Extract scheme from bundle ID (last segment timestamp, prefixed with "manus")
// e.g., "space.manus.my.app.t20240115103045" -> "manus20240115103045"
const bundleId = "space.manus.bionis.t264720628759806";
const timestamp = bundleId.split(".").pop()?.replace(/^t/, "") ?? "";
const schemeFromBundleId = `manus${timestamp}`;

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

const env = {
  apiBaseUrl:
    extra.apiBaseUrl ?? process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
  deepLinkScheme: schemeFromBundleId,
};

export const API_BASE_URL = env.apiBaseUrl;

/**
 * Get the API base URL, deriving from current hostname if not set.
 * Metro runs on 8081, API server runs on 3000.
 * URL pattern: https://PORT-sandboxid.region.domain
 */
export function getApiBaseUrl(): string {
  // If API_BASE_URL is set, use it
  if (API_BASE_URL) {
    return API_BASE_URL.replace(/\/$/, "");
  }

  // On web, derive from current hostname by replacing port 8081 with 3000
  if (ReactNative.Platform.OS === "web" && typeof window !== "undefined" && window.location) {
    const { protocol, hostname, port } = window.location;
    if (port === "8081") {
      return `${protocol}//${hostname}:3000`;
    }
    // Pattern: 8081-sandboxid.region.domain -> 3000-sandboxid.region.domain
    const apiHostname = hostname.replace(/^8081-/, "3000-");
    if (apiHostname !== hostname) {
      return `${protocol}//${apiHostname}`;
    }
  }

  // Fallback to empty (will use relative URL)
  return "";
}

export const SESSION_TOKEN_KEY = "app_session_token";
export const USER_INFO_KEY = "manus-runtime-user-info";

const encodeState = (value: string) => {
  if (typeof globalThis.btoa === "function") {
    return globalThis.btoa(value);
  }
  const BufferImpl = (globalThis as Record<string, any>).Buffer;
  if (BufferImpl) {
    return BufferImpl.from(value, "utf-8").toString("base64");
  }
  return value;
};

/**
 * Get the redirect URI for OAuth callback.
 * - Web: uses API server callback endpoint
 * - Native: uses deep link scheme
 */
export const getRedirectUri = () => {
  if (ReactNative.Platform.OS === "web") {
    return `${getApiBaseUrl()}/api/oauth/callback`;
  } else {
    return Linking.createURL("/oauth/callback", {
      scheme: env.deepLinkScheme,
    });
  }
};

export const getLoginUrl = async () => {
  const response = await fetch(`${getApiBaseUrl()}/api/oauth/config`);
  if (!response.ok) {
    throw new Error(`Serverul OAuth nu este disponibil (HTTP ${response.status}).`);
  }

  const config: unknown = await response.json();
  if (
    !config ||
    typeof config !== "object" ||
    !("portalUrl" in config) ||
    typeof config.portalUrl !== "string" ||
    !("appId" in config) ||
    typeof config.appId !== "string" ||
    !config.portalUrl ||
    !config.appId
  ) {
    throw new Error("Serverul Render nu are configurația OAuth completă.");
  }

  const redirectUri = getRedirectUri();
  const state = encodeState(redirectUri);

  const url = new URL(`${config.portalUrl.replace(/\/+$/, "")}/app-auth`);
  url.searchParams.set("appId", config.appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};

/**
 * Start OAuth login flow.
 *
 * On native platforms (iOS/Android), open the system browser directly so
 * the OAuth callback returns via deep link to the app.
 *
 * On web, this simply redirects to the login URL.
 *
 * @returns Always null, the callback is handled via deep link.
 */
export async function startOAuthLogin(): Promise<string | null> {
  const loginUrl = await getLoginUrl();

  if (ReactNative.Platform.OS === "web") {
    // On web, just redirect
    if (typeof window !== "undefined") {
      window.location.href = loginUrl;
    }
    return null;
  }

  const supported = await Linking.canOpenURL(loginUrl);
  if (!supported) {
    throw new Error("Dispozitivul nu poate deschide pagina de autentificare.");
  }
  await Linking.openURL(loginUrl);

  // The OAuth callback will reopen the app via deep link.
  return null;
}
