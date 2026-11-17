import { assistantRouter } from "./ai";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  assistant: assistantRouter,
  auth: authRouter,
  billing: billingRouter,
});

export type AppRouter = typeof appRouter;
