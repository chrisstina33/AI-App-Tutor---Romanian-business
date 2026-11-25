import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  authAccounts,
  centerAccessCodes,
  centerApplications,
  centerJoinRequests,
  centerMaterials,
  centerMemberships,
  educationalCenters,
  users,
} from "../drizzle/schema";
import { getDb } from "./db";
import { storageGetSignedUrl, storagePut } from "./storage";
import { protectedProcedure, router } from "./_core/trpc";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const allowedMimeTypes = ["application/pdf", "text/plain", "image/png", "image/jpeg"] as const;
const MAX_MATERIAL_SIZE = 8 * 1024 * 1024;
const mimeExtensions: Record<(typeof allowedMimeTypes)[number], string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function requireEducator(accountType: string): void {
  if (accountType !== "educator") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Această acțiune este disponibilă conturilor de centru educațional." });
  }
}

function requireStudent(accountType: string): void {
  if (accountType !== "student") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Doar elevii se pot înscrie într-un centru." });
  }
}

async function getActiveMembership(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, centerId: number) {
  const rows = await db.select({
    centerId: educationalCenters.id,
    status: educationalCenters.status,
    role: centerMemberships.role,
  })
    .from(centerMemberships)
    .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
    .where(and(
      eq(centerMemberships.userId, userId),
      eq(centerMemberships.centerId, centerId),
    ))
    .limit(1);
  const membership = rows[0];
  if (!membership || membership.status !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Materialele sunt disponibile doar membrilor unui centru activ." });
  }
  return membership;
}

export const educationRouter = router({
  requestCenterAccess: protectedProcedure
    .input(z.object({
      name: z.string().trim().min(2).max(180),
      contactEmail: z.string().trim().email().max(320),
      details: z.string().trim().max(2000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      requireEducator(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });

      const existing = await db.select({
        id: centerApplications.id,
        centerId: centerApplications.centerId,
        status: centerApplications.status,
      })
        .from(centerApplications)
        .where(eq(centerApplications.applicantId, ctx.user!.id))
        .limit(1);
      if (existing[0]?.status !== "rejected" && existing.length) {
        throw new TRPCError({ code: "CONFLICT", message: "Ai trimis deja o cerere pentru un centru." });
      }

      if (existing[0]) {
        await db.transaction(async (tx) => {
          await tx.update(educationalCenters)
            .set({ name: input.name, billingEmail: input.contactEmail, status: "draft" })
            .where(eq(educationalCenters.id, existing[0].centerId));
          await tx.update(centerApplications)
            .set({ details: input.details || null, status: "pending", reviewedAt: null })
            .where(eq(centerApplications.id, existing[0].id));
        });
        return { ok: true };
      }

      await db.transaction(async (tx) => {
        const [createdCenter] = await tx.insert(educationalCenters)
          .values({ name: input.name, billingEmail: input.contactEmail, status: "draft" })
          .$returningId();
        await tx.insert(centerMemberships).values({
          centerId: createdCenter.id,
          userId: ctx.user!.id,
          role: "owner",
        });
        await tx.insert(centerApplications).values({
          centerId: createdCenter.id,
          applicantId: ctx.user!.id,
          details: input.details || null,
        });
      });
      return { ok: true };
    }),

  mySpace: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user!.accountType !== "educator" && ctx.user!.accountType !== "student") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Spațiul centrelor este disponibil elevilor și educatorilor." });
    }
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });

    if (ctx.user!.accountType === "educator") {
      const rows = await db.select({
        id: educationalCenters.id,
        name: educationalCenters.name,
        status: educationalCenters.status,
        studentJoinMode: educationalCenters.studentJoinMode,
        applicationStatus: centerApplications.status,
        accessCodeExpiresAt: centerAccessCodes.expiresAt,
      })
        .from(centerMemberships)
        .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
        .leftJoin(centerApplications, eq(centerApplications.centerId, educationalCenters.id))
        .leftJoin(centerAccessCodes, and(
          eq(centerAccessCodes.centerId, educationalCenters.id),
          eq(centerAccessCodes.active, 1),
          gt(centerAccessCodes.expiresAt, new Date()),
        ))
        .where(and(eq(centerMemberships.userId, ctx.user!.id), eq(centerMemberships.role, "owner")))
        .limit(1);
      const center = rows[0];
      if (!center) return { kind: "educator" as const, center: null };

      const students = await db.select({ id: users.id, name: users.name })
        .from(centerMemberships)
        .innerJoin(users, eq(users.id, centerMemberships.userId))
        .where(and(eq(centerMemberships.centerId, center.id), eq(centerMemberships.role, "student")));
      const joinRequests = center.status === "active"
        ? await db.select({
          id: centerJoinRequests.id,
          studentId: users.id,
          studentName: users.name,
          createdAt: centerJoinRequests.createdAt,
        })
          .from(centerJoinRequests)
          .innerJoin(users, eq(users.id, centerJoinRequests.studentId))
          .where(and(
            eq(centerJoinRequests.centerId, center.id),
            eq(centerJoinRequests.status, "pending"),
          ))
          .orderBy(centerJoinRequests.createdAt)
        : [];
      const materials = await db.select({
        id: centerMaterials.id,
        title: centerMaterials.title,
        subject: centerMaterials.subject,
        fileName: centerMaterials.fileName,
        mimeType: centerMaterials.mimeType,
        createdAt: centerMaterials.createdAt,
      })
        .from(centerMaterials)
        .where(eq(centerMaterials.centerId, center.id))
        .orderBy(desc(centerMaterials.createdAt));
      return {
        kind: "educator" as const,
        center: {
          ...center,
          students,
          joinRequests: joinRequests.map((request) => ({ ...request, createdAt: request.createdAt.toISOString() })),
          materials: materials.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
        },
      };
    }

    const centers = await db.select({
      id: educationalCenters.id,
      name: educationalCenters.name,
    })
      .from(centerMemberships)
      .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
      .where(and(
        eq(centerMemberships.userId, ctx.user!.id),
        eq(centerMemberships.role, "student"),
        eq(educationalCenters.status, "active"),
      ));
    const directory = await db.select({
      id: educationalCenters.id,
      name: educationalCenters.name,
      studentJoinMode: educationalCenters.studentJoinMode,
      requestStatus: centerJoinRequests.status,
    })
      .from(educationalCenters)
      .leftJoin(centerJoinRequests, and(
        eq(centerJoinRequests.centerId, educationalCenters.id),
        eq(centerJoinRequests.studentId, ctx.user!.id),
      ))
      .where(eq(educationalCenters.status, "active"))
      .orderBy(educationalCenters.name);
    const memberCenterIds = new Set(centers.map((center) => center.id));
    const spaces = await Promise.all(centers.map(async (center) => {
      const materials = await db.select({
        id: centerMaterials.id,
        title: centerMaterials.title,
        subject: centerMaterials.subject,
        fileName: centerMaterials.fileName,
        mimeType: centerMaterials.mimeType,
        createdAt: centerMaterials.createdAt,
      })
        .from(centerMaterials)
        .where(eq(centerMaterials.centerId, center.id))
        .orderBy(desc(centerMaterials.createdAt));
      return {
        ...center,
        materials: materials.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      };
    }));
    return {
      kind: "student" as const,
      centers: spaces,
      directory: directory.filter((center) => !memberCenterIds.has(center.id)),
    };
  }),

  setStudentJoinMode: protectedProcedure
    .input(z.object({ mode: z.enum(["approval", "automatic"]) }))
    .mutation(async ({ ctx, input }) => {
      requireEducator(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const ownerRows = await db.select({ centerId: centerMemberships.centerId, status: educationalCenters.status })
        .from(centerMemberships)
        .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
        .where(and(eq(centerMemberships.userId, ctx.user!.id), eq(centerMemberships.role, "owner")))
        .limit(1);
      const owner = ownerRows[0];
      if (!owner || owner.status !== "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Setarea este disponibilă după aprobarea centrului." });
      }
      await db.update(educationalCenters)
        .set({ studentJoinMode: input.mode })
        .where(eq(educationalCenters.id, owner.centerId));
      return { ok: true };
    }),

  uploadMaterial: protectedProcedure
    .input(z.object({
      title: z.string().trim().min(1).max(180),
      subject: z.string().trim().max(80).optional(),
      fileName: z.string().trim().min(1).max(255),
      mimeType: z.enum(allowedMimeTypes),
      contentBase64: z.string().min(1).max(11_200_000),
    }))
    .mutation(async ({ ctx, input }) => {
      requireEducator(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const ownerRows = await db.select({ centerId: centerMemberships.centerId, status: educationalCenters.status })
        .from(centerMemberships)
        .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
        .where(and(eq(centerMemberships.userId, ctx.user!.id), eq(centerMemberships.role, "owner")))
        .limit(1);
      const owner = ownerRows[0];
      if (!owner || owner.status !== "active") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Centrul trebuie aprobat înainte de încărcarea materialelor." });
      }
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Fișierul încărcat nu este valid." });
      }
      const file = Buffer.from(input.contentBase64, "base64");
      if (!file.length || file.length > MAX_MATERIAL_SIZE) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Fișierul trebuie să aibă cel mult 8 MB." });
      }
      const storageKey = `centers/${owner.centerId}/materials/${randomUUID()}.${mimeExtensions[input.mimeType]}`;
      const stored = await storagePut(storageKey, file, input.mimeType);
      await db.insert(centerMaterials).values({
        centerId: owner.centerId,
        uploadedBy: ctx.user!.id,
        title: input.title,
        subject: input.subject || null,
        fileName: input.fileName.replace(/[\\/]/g, "_"),
        mimeType: input.mimeType,
        storageKey: stored.key,
      });
      return { ok: true };
    }),

  createStudentAccessCode: protectedProcedure.mutation(async ({ ctx }) => {
    requireEducator(ctx.user!.accountType);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
    const ownerRows = await db.select({ centerId: centerMemberships.centerId, status: educationalCenters.status })
      .from(centerMemberships)
      .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
      .where(and(eq(centerMemberships.userId, ctx.user!.id), eq(centerMemberships.role, "owner")))
      .limit(1);
    const owner = ownerRows[0];
    if (!owner || owner.status !== "active") {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Codurile pentru elevi sunt disponibile după aprobarea centrului." });
    }
    const code = randomBytes(6).toString("hex").toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.transaction(async (tx) => {
      await tx.update(centerAccessCodes).set({ active: 0 }).where(eq(centerAccessCodes.centerId, owner.centerId));
      await tx.insert(centerAccessCodes).values({
        codeHash: hash(code),
        centerId: owner.centerId,
        createdBy: ctx.user!.id,
        expiresAt,
      });
    });
    return { code, expiresAt: expiresAt.toISOString() };
  }),

  joinCenter: protectedProcedure
    .input(z.object({ code: z.string().trim().length(12) }))
    .mutation(async ({ ctx, input }) => {
      requireStudent(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const rows = await db.select({ centerId: centerAccessCodes.centerId })
        .from(centerAccessCodes)
        .innerJoin(educationalCenters, eq(educationalCenters.id, centerAccessCodes.centerId))
        .where(and(
          eq(centerAccessCodes.codeHash, hash(input.code.toUpperCase())),
          eq(centerAccessCodes.active, 1),
          gt(centerAccessCodes.expiresAt, new Date()),
          eq(educationalCenters.status, "active"),
        ))
        .limit(1);
      const center = rows[0];
      if (!center) throw new TRPCError({ code: "NOT_FOUND", message: "Cod invalid sau expirat. Cere centrului un cod nou." });
      const existing = await db.select({ id: centerMemberships.id }).from(centerMemberships)
        .where(and(eq(centerMemberships.centerId, center.centerId), eq(centerMemberships.userId, ctx.user!.id)))
        .limit(1);
      const alreadyMember = existing.length > 0;
      await db.transaction(async (tx) => {
        if (!alreadyMember) {
          await tx.insert(centerMemberships).values({ centerId: center.centerId, userId: ctx.user!.id, role: "student" });
        }
        await tx.update(centerJoinRequests)
          .set({ status: "approved", reviewedAt: new Date() })
          .where(and(
            eq(centerJoinRequests.centerId, center.centerId),
            eq(centerJoinRequests.studentId, ctx.user!.id),
            eq(centerJoinRequests.status, "pending"),
          ));
      });
      return { ok: true, alreadyMember };
    }),

  requestStudentJoin: protectedProcedure
    .input(z.object({ centerId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      requireStudent(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const [center] = await db.select({
        id: educationalCenters.id,
        studentJoinMode: educationalCenters.studentJoinMode,
      })
        .from(educationalCenters)
        .where(and(
          eq(educationalCenters.id, input.centerId),
          eq(educationalCenters.status, "active"),
        ))
        .limit(1);
      if (!center) throw new TRPCError({ code: "NOT_FOUND", message: "Centrul nu există sau nu este activ." });

      return db.transaction(async (tx) => {
        const [membership] = await tx.select({ id: centerMemberships.id })
          .from(centerMemberships)
          .where(and(
            eq(centerMemberships.centerId, center.id),
            eq(centerMemberships.userId, ctx.user!.id),
          ))
          .limit(1);
        if (membership) return { status: "member" as const };

        const [existingRequest] = await tx.select({
          id: centerJoinRequests.id,
          status: centerJoinRequests.status,
        })
          .from(centerJoinRequests)
          .where(and(
            eq(centerJoinRequests.centerId, center.id),
            eq(centerJoinRequests.studentId, ctx.user!.id),
          ))
          .limit(1);
        if (existingRequest?.status === "pending") return { status: "pending" as const };

        const status = center.studentJoinMode === "automatic" ? "approved" : "pending";
        const reviewedAt = status === "approved" ? new Date() : null;
        if (existingRequest) {
          await tx.update(centerJoinRequests)
            .set({ status, reviewedAt, createdAt: new Date() })
            .where(eq(centerJoinRequests.id, existingRequest.id));
        } else {
          await tx.insert(centerJoinRequests).values({
            centerId: center.id,
            studentId: ctx.user!.id,
            status,
            reviewedAt,
          });
        }
        if (status === "approved") {
          await tx.insert(centerMemberships).values({
            centerId: center.id,
            userId: ctx.user!.id,
            role: "student",
          });
          return { status: "joined" as const };
        }
        return { status: "pending" as const };
      });
    }),

  reviewStudentJoinRequest: protectedProcedure
    .input(z.object({
      requestId: z.number().int().positive(),
      decision: z.enum(["approved", "rejected"]),
    }))
    .mutation(async ({ ctx, input }) => {
      requireEducator(ctx.user!.accountType);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const [owner] = await db.select({
        centerId: centerMemberships.centerId,
        status: educationalCenters.status,
      })
        .from(centerMemberships)
        .innerJoin(educationalCenters, eq(educationalCenters.id, centerMemberships.centerId))
        .where(and(
          eq(centerMemberships.userId, ctx.user!.id),
          eq(centerMemberships.role, "owner"),
        ))
        .limit(1);
      if (!owner || owner.status !== "active") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Doar reprezentantul unui centru activ poate analiza cererile." });
      }

      await db.transaction(async (tx) => {
        const [request] = await tx.select({ studentId: centerJoinRequests.studentId })
          .from(centerJoinRequests)
          .where(and(
            eq(centerJoinRequests.id, input.requestId),
            eq(centerJoinRequests.centerId, owner.centerId),
            eq(centerJoinRequests.status, "pending"),
          ))
          .limit(1);
        if (!request) {
          throw new TRPCError({ code: "CONFLICT", message: "Cererea a fost deja analizată sau nu mai există." });
        }
        const [updated] = await tx.update(centerJoinRequests)
          .set({ status: input.decision, reviewedAt: new Date() })
          .where(and(
            eq(centerJoinRequests.id, input.requestId),
            eq(centerJoinRequests.status, "pending"),
          ));
        if (!updated.affectedRows) {
          throw new TRPCError({ code: "CONFLICT", message: "Cererea a fost deja analizată sau nu mai există." });
        }
        if (input.decision === "approved") {
          const [membership] = await tx.select({ id: centerMemberships.id })
            .from(centerMemberships)
            .where(and(
              eq(centerMemberships.centerId, owner.centerId),
              eq(centerMemberships.userId, request.studentId),
            ))
            .limit(1);
          if (!membership) {
            await tx.insert(centerMemberships).values({
              centerId: owner.centerId,
              userId: request.studentId,
              role: "student",
            });
          }
        }
      });
      return { ok: true };
    }),

  downloadMaterial: protectedProcedure
    .input(z.object({ materialId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      const rows = await db.select({
        centerId: centerMaterials.centerId,
        storageKey: centerMaterials.storageKey,
      }).from(centerMaterials).where(eq(centerMaterials.id, input.materialId)).limit(1);
      const material = rows[0];
      if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "Materialul nu mai este disponibil." });
      await getActiveMembership(db, ctx.user!.id, material.centerId);
      return { url: await storageGetSignedUrl(material.storageKey) };
    }),

  pendingApplications: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user!.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Doar administratorii pot analiza cererile centrelor." });
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
    const rows = await db.select({
      centerId: educationalCenters.id,
      name: educationalCenters.name,
      contactEmail: educationalCenters.billingEmail,
      details: centerApplications.details,
      applicantName: users.name,
      applicantEmail: authAccounts.email,
      createdAt: centerApplications.createdAt,
    })
      .from(centerApplications)
      .innerJoin(educationalCenters, eq(educationalCenters.id, centerApplications.centerId))
      .innerJoin(users, eq(users.id, centerApplications.applicantId))
      .innerJoin(authAccounts, eq(authAccounts.userId, users.id))
      .where(eq(centerApplications.status, "pending"))
      .orderBy(centerApplications.createdAt);
    return rows.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() }));
  }),

  reviewApplication: protectedProcedure
    .input(z.object({ centerId: z.number().int().positive(), decision: z.enum(["approved", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user!.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Doar administratorii pot analiza cererile centrelor." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Baza de date nu este configurată." });
      await db.transaction(async (tx) => {
        const [updated] = await tx.update(centerApplications)
          .set({ status: input.decision, reviewedAt: new Date() })
          .where(and(eq(centerApplications.centerId, input.centerId), eq(centerApplications.status, "pending")));
        if (!updated.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "Cererea a fost deja analizată sau nu mai există." });
        if (input.decision === "approved") {
          await tx.update(educationalCenters).set({ status: "active" }).where(eq(educationalCenters.id, input.centerId));
        }
      });
      return { ok: true };
    }),
});
