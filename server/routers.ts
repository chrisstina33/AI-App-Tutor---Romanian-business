import { assistantRouter } from "./ai";
import { systemRouter } from "./_core/systemRouter";
import { router } from "./_core/trpc";

export const appRouter = router({
  system: systemRouter,
  assistant: assistantRouter,
});

export type AppRouter = typeof appRouter;
