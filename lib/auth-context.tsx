import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearAuthToken, readAuthToken, saveAuthToken } from "@/lib/auth-session";
import { trpc } from "@/lib/trpc";

export type AuthUser = { id: number; name: string; email: string; accountType: "student" | "parent" };
type AuthValue = { token: string | null; user: AuthUser | null; ready: boolean; beginSession: (token: string, user: AuthUser) => Promise<void>; endSession: () => Promise<void> };
const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => { void readAuthToken().then((saved) => { setToken(saved); setReady(true); }).catch(() => setReady(true)); }, []);
  const me = trpc.auth.me.useQuery(undefined, { enabled: ready && Boolean(token), retry: false });
  useEffect(() => {
    if (me.error?.data?.code !== "UNAUTHORIZED") return;
    void clearAuthToken().catch(() => undefined).finally(() => {
      setToken(null);
      setSessionUser(null);
    });
  }, [me.error]);
  const beginSession = useCallback(async (newToken: string, account: AuthUser) => { await saveAuthToken(newToken); setToken(newToken); setSessionUser(account); }, []);
  const endSession = useCallback(async () => { try { await clearAuthToken(); } catch { /* Clear local session state even if storage is unavailable. */ } setToken(null); setSessionUser(null); }, []);
  const user = token ? (sessionUser ?? me.data ?? null) : null;
  const value = useMemo(() => ({ token, user, ready, beginSession, endSession }), [token, user, ready, beginSession, endSession]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth must be used inside AuthProvider"); return value; }
