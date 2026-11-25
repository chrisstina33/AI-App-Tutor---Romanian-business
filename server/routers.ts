import { assistantRouter } from "./ai";
import { authRouter } from "./auth";
import { billingRouter } from "./billing";
import { educationRouter } from "./education";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  assistant: assistantRouter,
  auth: authRouter,
  billing: billingRouter,
  education: educationRouter,
});

export type AppRouter = typeof appRouter;
