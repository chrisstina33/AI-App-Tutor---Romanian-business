import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";
import type { LearnerState } from "../shared/learning";

/**
 * Legacy account tables retained for existing database data; account login is currently disabled.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** External account identifier. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const learnerStates = mysqlTable("learner_states", {
  userId: int("userId")
    .notNull()
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  state: json("state").$type<LearnerState>().notNull(),
  updatedAt: timestamp("updatedAt")
    .defaultNow()
    .onUpdateNow()
    .notNull(),
});

export const authAccounts = mysqlTable("auth_accounts", {
  userId: int("userId").notNull().primaryKey().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  accountType: mysqlEnum("accountType", ["student", "parent"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const authSessions = mysqlTable("auth_sessions", {
  tokenHash: varchar("tokenHash", { length: 64 }).notNull().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const parentInvites = mysqlTable("parent_invites", {
  codeHash: varchar("codeHash", { length: 64 }).notNull().primaryKey(),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
});

export const parentLinks = mysqlTable("parent_links", {
  id: int("id").autoincrement().primaryKey(),
  parentId: int("parentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("parent_student_unique").on(table.parentId, table.studentId)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
