import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "elunariq.auth-token.v1";
export function readAuthToken() { return AsyncStorage.getItem(TOKEN_KEY); }
export function saveAuthToken(token: string) { return AsyncStorage.setItem(TOKEN_KEY, token); }
export function clearAuthToken() { return AsyncStorage.removeItem(TOKEN_KEY); }
