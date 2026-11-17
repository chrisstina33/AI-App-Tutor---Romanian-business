import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhook } from "../server/billing";

describe("Stripe webhook signature verification", () => {
  const secret = "whsec_test_secret";
  const timestamp = 1_800_000_000;
  const body = Buffer.from(
    '{"id":"evt_test","type":"customer.subscription.updated"}',
  );

  it("accepts a matching signed raw payload", () => {
    const digest = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(body)
      .digest("hex");

    expect(
      verifyStripeWebhook(
        body,
        `t=${timestamp},v1=${digest}`,
        secret,
        timestamp,
      ),
    ).toEqual({ id: "evt_test", type: "customer.subscription.updated" });
  });

  it("rejects a stale or tampered payload", () => {
    const digest = createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(body)
      .digest("hex");

    expect(() =>
      verifyStripeWebhook(
        body,
        `t=${timestamp},v1=${digest}`,
        secret,
        timestamp + 301,
      ),
    ).toThrow("Invalid Stripe webhook signature.");
    expect(() =>
      verifyStripeWebhook(
        Buffer.from("{}"),
        `t=${timestamp},v1=${digest}`,
        secret,
        timestamp,
      ),
    ).toThrow("Invalid Stripe webhook signature.");
  });
});
