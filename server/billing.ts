import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  authAccounts,
  billingEvents,
  parentLinks,
  subscriptions,
} from "../drizzle/schema";
import { PREMIUM_MONTHLY_PRICE_MINOR } from "../shared/billing";
import { ENV } from "./_core/env";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { TRPCError } from "@trpc/server";

const activeStatuses = ["active", "trialing"] as const;
const billableStatuses = [
  "active",
  "trialing",
  "past_due",
  "incomplete",
] as const;

function missingBillingConfiguration(): never {
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message:
      "Plata nu este configurată pe server. Contactează administratorul.",
  });
}

async function stripePost(path: string, values: Record<string, string>) {
  if (!ENV.stripeSecretKey) missingBillingConfiguration();
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ENV.stripeSecretKey}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(values),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    const message = z
      .object({
        error: z.object({ message: z.string().optional() }).optional(),
      })
      .safeParse(body).data?.error?.message;
    console.error("[Billing] Stripe request rejected", {
      path,
      status: response.status,
    });
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: message
        ? `Procesatorul de plăți a refuzat cererea: ${message.slice(0, 180)}`
        : "Procesatorul de plăți nu a putut procesa cererea.",
    });
  }
  return body;
}

function checkoutUrls() {
  if (!ENV.appBaseUrl) missingBillingConfiguration();
  let base: URL;
  try {
    base = new URL(ENV.appBaseUrl);
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "APP_BASE_URL nu este o adresă web validă.",
    });
  }
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "APP_BASE_URL trebuie să folosească HTTPS.",
    });
  }
  return {
    success: new URL("/profile?billing=success", base).toString(),
    cancel: new URL("/profile?billing=cancel", base).toString(),
    return: new URL("/profile", base).toString(),
  };
}

const stripeSignatureError = "Invalid Stripe webhook signature.";

export function verifyStripeWebhook(
  rawBody: Buffer,
  signature: string | undefined,
  secret = ENV.stripeWebhookSecret,
  nowSeconds = Math.floor(Date.now() / 1000),
): unknown {
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
  if (!signature) throw new Error(stripeSignatureError);
  const parts = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1];
  const signatures = parts
    .filter(([key]) => key === "v1")
    .map(([, value]) => value);
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(nowSeconds - Number(timestamp)) > 300
  ) {
    throw new Error(stripeSignatureError);
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  const valid = signatures.some((value) => {
    if (!/^[\da-f]{64}$/i.test(value)) return false;
    const actual = Buffer.from(value, "hex");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  });
  if (!valid) throw new Error(stripeSignatureError);
  return JSON.parse(rawBody.toString("utf8")) as unknown;
}

const stripeEventSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  created: z.number().int().nonnegative(),
  data: z.object({ object: z.unknown() }),
});

const stripeSubscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string(), z.object({ id: z.string() })]),
  status: z.string().min(1).max(32),
  current_period_end: z.number().int().positive().optional(),
  cancel_at_period_end: z.boolean(),
  metadata: z.record(z.string(), z.string()).default({}),
});

export async function processStripeWebhook(payload: unknown): Promise<void> {
  const event = stripeEventSchema.parse(payload);
  const isSubscriptionEvent = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
  ].includes(event.type);
  const subscription = isSubscriptionEvent
    ? stripeSubscriptionSchema.parse(event.data.object)
    : null;
  const parentId = Number(subscription?.metadata.parentId);
  const studentId = Number(subscription?.metadata.studentId);
  const customerId =
    typeof subscription?.customer === "string"
      ? subscription.customer
      : subscription?.customer.id;

  const db = await getDb();
  if (!db) throw new Error("Database is not configured for billing webhooks.");
  await db.transaction(async (tx) => {
    const existingEvent = await tx
      .select({ eventId: billingEvents.eventId })
      .from(billingEvents)
      .where(eq(billingEvents.eventId, event.id))
      .limit(1);
    if (existingEvent.length) return;

    await tx.insert(billingEvents).values({ eventId: event.id });
    if (
      !subscription ||
      !customerId ||
      !Number.isSafeInteger(parentId) ||
      parentId < 1 ||
      !Number.isSafeInteger(studentId) ||
      studentId < 1
    )
      return;

    const link = await tx
      .select({ parentId: parentLinks.parentId })
      .from(parentLinks)
      .innerJoin(authAccounts, eq(authAccounts.userId, parentLinks.parentId))
      .where(
        and(
          eq(parentLinks.parentId, parentId),
          eq(parentLinks.studentId, studentId),
          eq(authAccounts.accountType, "parent"),
        ),
      )
      .limit(1);
    if (!link.length) {
      console.warn(
        "[Billing] Subscription metadata did not match a parent/student link",
        {
          subscriptionId: subscription.id,
        },
      );
      return;
    }

    const current = await tx
      .select({
        id: subscriptions.id,
        lastStripeEventCreatedAt: subscriptions.lastStripeEventCreatedAt,
      })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, subscription.id))
      .limit(1);
    if (current[0] && current[0].lastStripeEventCreatedAt > event.created)
      return;

    const values = {
      parentId,
      studentId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      status:
        event.type === "customer.subscription.deleted"
          ? "canceled"
          : subscription.status,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end ? 1 : 0,
      lastStripeEventCreatedAt: event.created,
    };
    await tx
      .insert(subscriptions)
      .values(values)
      .onDuplicateKeyUpdate({
        set: {
          status: values.status,
          currentPeriodEnd: values.currentPeriodEnd,
          cancelAtPeriodEnd: values.cancelAtPeriodEnd,
          lastStripeEventCreatedAt: values.lastStripeEventCreatedAt,
        },
      });
  });
}

export async function hasPremiumAccess(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        or(
          eq(subscriptions.parentId, userId),
          eq(subscriptions.studentId, userId),
        ),
        inArray(subscriptions.status, [...activeStatuses]),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export const billingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Abonamentele au nevoie de baza de date configurată.",
      });
    const rows = await db
      .select({
        status: subscriptions.status,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
        studentId: subscriptions.studentId,
      })
      .from(subscriptions)
      .where(
        and(
          ctx.user.accountType === "parent"
            ? eq(subscriptions.parentId, ctx.user.id)
            : eq(subscriptions.studentId, ctx.user.id),
          inArray(subscriptions.status, [...activeStatuses]),
        ),
      )
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
    const subscription = rows[0];
    return {
      active: Boolean(subscription),
      status: subscription?.status ?? null,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: Boolean(subscription?.cancelAtPeriodEnd),
      studentId: subscription?.studentId ?? null,
    };
  }),

  createCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.accountType !== "parent") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Abonamentul pentru un elev se cumpără din contul părintelui.",
      });
    }
    if (!ENV.stripeSecretKey) missingBillingConfiguration();
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Abonamentele au nevoie de baza de date configurată.",
      });

    const linkedStudents = await db
      .select({ studentId: parentLinks.studentId })
      .from(parentLinks)
      .where(eq(parentLinks.parentId, ctx.user.id));
    if (linkedStudents.length !== 1) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: linkedStudents.length
          ? "Planul de pilot acoperă un singur elev. Pentru mai mulți elevi, stabilește mai întâi planul centrului familial."
          : "Asociază contul unui elev înainte de a cumpăra abonamentul.",
      });
    }
    const studentId = linkedStudents[0].studentId;
    const existing = await db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.studentId, studentId),
          inArray(subscriptions.status, [...billableStatuses]),
        ),
      )
      .limit(1);
    if (existing.length) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Elevul are deja un abonament activ sau în curs de procesare.",
      });
    }

    const urls = checkoutUrls();
    const parentMetadata = {
      "metadata[parentId]": String(ctx.user.id),
      "metadata[studentId]": String(studentId),
      "subscription_data[metadata][parentId]": String(ctx.user.id),
      "subscription_data[metadata][studentId]": String(studentId),
      "subscription_data[metadata][plan]": "premium",
    };
    const result = await stripePost("checkout/sessions", {
      mode: "subscription",
      customer_email: ctx.user.email,
      client_reference_id: String(ctx.user.id),
      success_url: urls.success,
      cancel_url: urls.cancel,
      "line_items[0][price_data][currency]": "ron",
      "line_items[0][price_data][product_data][name]":
        "Elunariq Premium pentru un elev",
      "line_items[0][price_data][unit_amount]": String(PREMIUM_MONTHLY_PRICE_MINOR),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][quantity]": "1",
      "payment_method_types[0]": "card",
      ...parentMetadata,
    });
    const session = z.object({ url: z.string().url() }).safeParse(result);
    if (!session.success || !session.data.url.startsWith("https://")) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Procesatorul de plăți nu a returnat un link securizat.",
      });
    }
    return { url: session.data.url };
  }),

  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.accountType !== "parent") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message:
          "Administrarea abonamentului este disponibilă în contul părintelui.",
      });
    }
    const db = await getDb();
    if (!db)
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "Abonamentele au nevoie de baza de date configurată.",
      });
    const existing = await db
      .select({ stripeCustomerId: subscriptions.stripeCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.parentId, ctx.user.id))
      .orderBy(desc(subscriptions.updatedAt))
      .limit(1);
    if (!existing[0]) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Nu există un abonament de administrat.",
      });
    }
    const result = await stripePost("billing_portal/sessions", {
      customer: existing[0].stripeCustomerId,
      return_url: checkoutUrls().return,
    });
    const session = z.object({ url: z.string().url() }).safeParse(result);
    if (!session.success || !session.data.url.startsWith("https://")) {
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: "Procesatorul de plăți nu a returnat un link securizat.",
      });
    }
    return { url: session.data.url };
  }),
});
