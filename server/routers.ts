import { assistantRouter } from "./ai";
import { authRouter } from "./auth";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  assistant: assistantRouter,
  auth: authRouter,
});

export type AppRouter = typeof appRouter;
