import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { createCorsMiddleware } from "./cors";
import { processStripeWebhook, verifyStripeWebhook } from "../billing";

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use(createCorsMiddleware());

  app.post("/api/billing/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: "Invalid webhook body." });
        return;
      }
      const event = verifyStripeWebhook(req.body, req.header("stripe-signature"));
      await processStripeWebhook(event);
      res.sendStatus(200);
    } catch (error) {
      const invalidSignature = error instanceof Error
        && error.message === "Invalid Stripe webhook signature.";
      console.error("[Billing] Webhook rejected", {
        reason: invalidSignature ? "invalid signature" : "processing failed",
      });
      res.status(invalidSignature ? 400 : 500).json({
        error: invalidSignature ? "Invalid webhook signature." : "Webhook processing failed.",
      });
    }
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const port = parseInt(process.env.PORT || "3000");
  server.listen(port, () => {
    console.log("[api] server listening");
  });
}

startServer().catch((error) => {
  console.error("[api] server failed to start", error);
});
