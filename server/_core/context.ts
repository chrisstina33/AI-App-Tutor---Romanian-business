import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { eq } from "drizzle-orm";
import { authAccounts, authSessions, users } from "../../drizzle/schema";
import { getDb } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user?: { id: number; name: string | null; email: string; accountType: "student" | "parent" };
  sessionTokenHash?: string;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const authorization = opts.req.headers.authorization;
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  let user: TrpcContext["user"];
  let sessionTokenHash: string | undefined;
  if (token) {
    const { createHash } = await import("node:crypto");
    sessionTokenHash = createHash("sha256").update(token).digest("hex");
    const db = await getDb();
    if (db) {
      const rows = await db.select({ id: users.id, name: users.name, email: authAccounts.email, accountType: authAccounts.accountType, expiresAt: authSessions.expiresAt }).from(authSessions).innerJoin(users, eq(users.id, authSessions.userId)).innerJoin(authAccounts, eq(authAccounts.userId, users.id)).where(eq(authSessions.tokenHash, sessionTokenHash)).limit(1);
      const session = rows[0];
      if (session && session.expiresAt.getTime() > Date.now()) user = { id: session.id, name: session.name, email: session.email, accountType: session.accountType };
    }
  }
  return {
    req: opts.req,
    res: opts.res,
    user,
    sessionTokenHash,
  };
}
