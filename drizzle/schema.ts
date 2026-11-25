import {
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  index,
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
  accountType: mysqlEnum("accountType", ["student", "parent", "educator"]).notNull(),
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

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  parentId: int("parentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  stripeCustomerId: varchar("stripeCustomerId", { length: 255 }).notNull(),
  stripeSubscriptionId: varchar("stripeSubscriptionId", { length: 255 }).notNull().unique(),
  status: varchar("status", { length: 32 }).notNull(),
  currentPeriodEnd: timestamp("currentPeriodEnd"),
  cancelAtPeriodEnd: int("cancelAtPeriodEnd").notNull().default(0),
  lastStripeEventCreatedAt: int("lastStripeEventCreatedAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("subscriptions_parent_status_idx").on(table.parentId, table.status),
  index("subscriptions_student_status_idx").on(table.studentId, table.status),
]);

export const billingEvents = mysqlTable("billing_events", {
  eventId: varchar("eventId", { length: 255 }).notNull().primaryKey(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export const educationalCenters = mysqlTable("educational_centers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  billingEmail: varchar("billingEmail", { length: 320 }),
  status: mysqlEnum("status", ["draft", "active", "suspended"]).default("draft").notNull(),
  studentJoinMode: mysqlEnum("studentJoinMode", ["approval", "automatic"]).default("approval").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const centerMemberships = mysqlTable("center_memberships", {
  id: int("id").autoincrement().primaryKey(),
  centerId: int("centerId").notNull().references(() => educationalCenters.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "educator", "student"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [uniqueIndex("center_user_unique").on(table.centerId, table.userId)]);

export const centerApplications = mysqlTable("center_applications", {
  id: int("id").autoincrement().primaryKey(),
  centerId: int("centerId").notNull().references(() => educationalCenters.id, { onDelete: "cascade" }).unique(),
  applicantId: int("applicantId").notNull().references(() => users.id, { onDelete: "cascade" }).unique(),
  details: text("details"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("center_applications_status_idx").on(table.status)]);

export const centerMaterials = mysqlTable("center_materials", {
  id: int("id").autoincrement().primaryKey(),
  centerId: int("centerId").notNull().references(() => educationalCenters.id, { onDelete: "cascade" }),
  uploadedBy: int("uploadedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  title: varchar("title", { length: 180 }).notNull(),
  subject: varchar("subject", { length: 80 }),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 100 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("center_materials_center_idx").on(table.centerId)]);

export const centerAccessCodes = mysqlTable("center_access_codes", {
  codeHash: varchar("codeHash", { length: 64 }).notNull().primaryKey(),
  centerId: int("centerId").notNull().references(() => educationalCenters.id, { onDelete: "cascade" }),
  createdBy: int("createdBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expiresAt").notNull(),
  active: int("active").notNull().default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [index("center_access_codes_center_idx").on(table.centerId)]);

export const centerJoinRequests = mysqlTable("center_join_requests", {
  id: int("id").autoincrement().primaryKey(),
  centerId: int("centerId").notNull().references(() => educationalCenters.id, { onDelete: "cascade" }),
  studentId: int("studentId").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("center_join_request_unique").on(table.centerId, table.studentId),
  index("center_join_requests_center_status_idx").on(table.centerId, table.status),
]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
