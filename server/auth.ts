import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { authAccounts, authSessions, learnerStates, parentInvites, parentLinks, users } from "../drizzle/schema";
import { learnerStateSchema } from "../shared/learning";
import { getDb } from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";

function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
function passwordHash(password: string, salt = randomBytes(16).toString("hex")) { return `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`; }
function passwordMatches(password: string, stored: string) {
  const [, salt, digest] = stored.split("$");
  if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || candidate.errno === 1062;
}
function authDatabaseUnavailable(operation: string, error: unknown): never {
  let current = error;
  let candidate: { code?: unknown; errno?: unknown } = {};
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth += 1) {
    const cause = current as { code?: unknown; errno?: unknown; cause?: unknown };
    if (cause.code !== undefined || cause.errno !== undefined) {
      candidate = cause;
      break;
    }
    current = cause.cause;
  }
  const missingTable = candidate.code === "ER_NO_SUCH_TABLE" || candidate.errno === 1146;
  console.error(`[Auth] ${operation} database operation failed`, {
    code: typeof candidate.code === "string" ? candidate.code : "unknown",
    errno: typeof candidate.errno === "number" ? candidate.errno : undefined,
  });
  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: missingTable
      ? "Tabelele pentru conturi lipsesc. Aplică migrațiile bazei de date cu `pnpm db:migrate`."
      : "Serviciul de conturi nu poate accesa baza de date momentan. Încearcă din nou mai târziu.",
  });
}
function unavailable(): never { throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Conturile au nevoie de DATABASE_URL (sau toate câmpurile DATABASE_*), de conexiune la baza de date și de migrarea auth v2 pe server." }); }
async function createSession(userId: number) {
  const db = await getDb(); if (!db) unavailable();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(authSessions).values({ tokenHash: hash(token), userId, expiresAt });
  return { token, expiresAt: expiresAt.toISOString() };
}
const accountPublic = (user: { id: number; name: string | null; email: string; accountType: "student" | "parent" | "educator"; role: "user" | "admin" }) => ({ id: user.id, name: user.name ?? "", email: user.email, accountType: user.accountType, role: user.role });
const attempts = new Map<string, { count: number; resetAt: number }>();
function allowAttempt(key: string) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) { attempts.set(key, { count: 1, resetAt: now + 15 * 60_000 }); return; }
  entry.count += 1;
  if (entry.count > 8) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Prea multe încercări. Reîncearcă peste câteva minute." });
}

export const authRouter = router({
  signUp: publicProcedure.input(z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email().max(320), password: z.string().min(10).max(128), accountType: z.enum(["student", "parent", "educator"]) })).mutation(async ({ input }) => {
    const db = await getDb(); if (!db) unavailable();
    const email = input.email.toLowerCase();
    allowAttempt(`signup:${email}`);
    const openId = randomUUID();
    const hashedPassword = passwordHash(input.password);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    let userId: number;
    try {
      const existing = await db.select({ userId: authAccounts.userId }).from(authAccounts).where(eq(authAccounts.email, email)).limit(1);
      if (existing.length) throw new TRPCError({ code: "CONFLICT", message: "Există deja un cont cu această adresă de e-mail." });
      userId = await db.transaction(async (tx) => {
        await tx.insert(users).values({ openId, name: input.name, email, loginMethod: "password" });
        const accountUser = await tx.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
        const createdUserId = accountUser[0]?.id;
        if (!createdUserId) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Contul nu a putut fi creat." });
        await tx.insert(authAccounts).values({ userId: createdUserId, email, passwordHash: hashedPassword, accountType: input.accountType });
        await tx.insert(authSessions).values({ tokenHash: hash(token), userId: createdUserId, expiresAt });
        return createdUserId;
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new TRPCError({ code: "CONFLICT", message: "Există deja un cont cu această adresă de e-mail." });
      if (error instanceof TRPCError) throw error;
      authDatabaseUnavailable("Sign-up", error);
    }
    return { session: { token, expiresAt: expiresAt.toISOString() }, user: { id: userId, name: input.name, email, accountType: input.accountType, role: "user" as const } };
  }),
  signIn: publicProcedure.input(z.object({ email: z.string().trim().email().max(320), password: z.string().min(1).max(128) })).mutation(async ({ input }) => {
    allowAttempt(`signin:${input.email.toLowerCase()}`);
    const db = await getDb(); if (!db) unavailable();
    let rows: { id: number; name: string | null; email: string; accountType: "student" | "parent" | "educator"; role: "user" | "admin"; passwordHash: string }[];
    try {
      rows = await db.select({ id: users.id, name: users.name, email: authAccounts.email, accountType: authAccounts.accountType, role: users.role, passwordHash: authAccounts.passwordHash }).from(authAccounts).innerJoin(users, eq(users.id, authAccounts.userId)).where(eq(authAccounts.email, input.email.toLowerCase())).limit(1);
    } catch (error) {
      authDatabaseUnavailable("Sign-in", error);
    }
    const row = rows[0];
    if (!row || !passwordMatches(input.password, row.passwordHash)) throw new TRPCError({ code: "UNAUTHORIZED", message: "E-mailul sau parola nu sunt corecte." });
    try {
      return { session: await createSession(row.id), user: accountPublic(row) };
    } catch (error) {
      authDatabaseUnavailable("Session creation", error);
    }
  }),
  signOut: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionTokenHash) { const db = await getDb(); if (db) await db.delete(authSessions).where(eq(authSessions.tokenHash, ctx.sessionTokenHash)); }
    return { ok: true };
  }),
  me: protectedProcedure.query(({ ctx }) => accountPublic(ctx.user!)),
  createParentInvite: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user!.accountType !== "student") throw new TRPCError({ code: "FORBIDDEN", message: "Doar contul elevului poate crea codul de asociere." });
    const db = await getDb(); if (!db) unavailable();
    const code = randomBytes(8).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await db.insert(parentInvites).values({ codeHash: hash(code), studentId: ctx.user!.id, expiresAt });
    return { code, expiresAt: expiresAt.toISOString() };
  }),
  linkStudent: protectedProcedure.input(z.object({ code: z.string().trim().length(16) })).mutation(async ({ ctx, input }) => {
    if (ctx.user!.accountType !== "parent") throw new TRPCError({ code: "FORBIDDEN", message: "Asocierea se face dintr-un cont de părinte." });
    allowAttempt(`parent-link:${ctx.user!.id}`);
    const db = await getDb(); if (!db) unavailable();
    const codeHash = hash(input.code.toUpperCase());
    await db.transaction(async (tx) => {
      const invite = await tx.select().from(parentInvites).where(and(eq(parentInvites.codeHash, codeHash), isNull(parentInvites.usedAt), gt(parentInvites.expiresAt, new Date()))).limit(1);
      if (!invite[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Cod expirat sau invalid. Cere elevului un cod nou." });
      const [claimed] = await tx.update(parentInvites).set({ usedAt: new Date() }).where(and(eq(parentInvites.codeHash, codeHash), isNull(parentInvites.usedAt), gt(parentInvites.expiresAt, new Date())));
      if (!claimed.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "Codul a fost folosit. Cere elevului un cod nou." });
      await tx.insert(parentLinks).values({ parentId: ctx.user!.id, studentId: invite[0].studentId });
    });
    return { ok: true };
  }),
  parentOverview: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user!.accountType !== "parent") throw new TRPCError({ code: "FORBIDDEN", message: "Disponibil doar în contul de părinte." });
    const db = await getDb(); if (!db) unavailable();
    const links = await db.select({ id: users.id, name: users.name, state: learnerStates.state, updatedAt: learnerStates.updatedAt }).from(parentLinks).innerJoin(users, eq(users.id, parentLinks.studentId)).leftJoin(learnerStates, eq(learnerStates.userId, users.id)).where(eq(parentLinks.parentId, ctx.user!.id));
    return links.map((item) => ({ studentId: item.id, name: item.name ?? "Elev", questionsAsked: item.state?.questionsAsked ?? 0, lessons: item.state?.lessonActivity ?? [], updatedAt: item.updatedAt?.toISOString() ?? null }));
  }),
  syncLearnerState: protectedProcedure.input(learnerStateSchema).mutation(async ({ ctx, input }) => {
    if (ctx.user!.accountType !== "student") throw new TRPCError({ code: "FORBIDDEN", message: "Doar contul elevului își poate sincroniza progresul." });
    const db = await getDb(); if (!db) unavailable();
    await db.insert(learnerStates).values({ userId: ctx.user!.id, state: input }).onDuplicateKeyUpdate({ set: { state: input, updatedAt: new Date() } });
    return { ok: true };
  }),
  myLearnerState: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user!.accountType !== "student") return null;
    const db = await getDb(); if (!db) unavailable();
    const rows = await db.select({ state: learnerStates.state, updatedAt: learnerStates.updatedAt }).from(learnerStates).where(eq(learnerStates.userId, ctx.user!.id)).limit(1);
    return rows[0] ? { state: rows[0].state, updatedAt: rows[0].updatedAt.toISOString() } : null;
  }),
});
