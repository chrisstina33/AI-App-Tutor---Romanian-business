import {
  getSessionCookieName,
  getSessionCookieOptions,
} from "./_core/cookies";
import { assistantRouter } from "./ai";
import { systemRouter } from "./_core/systemRouter";
import { getLearnerState, saveLearnerState } from "./db";
import { learnerStateSchema } from "../shared/learning";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  assistant: assistantRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(getSessionCookieName(ctx.req), {
        ...cookieOptions,
        maxAge: -1,
      });
      return { success: true } as const;
    }),
  }),
  learning: router({
    getState: protectedProcedure
      .input(z.object({ openId: z.string().min(1).max(64) }))
      .query(({ ctx, input }) => {
        if (input.openId !== ctx.user.openId || ctx.user.id < 0) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return getLearnerState(ctx.user.id);
      }),
    saveState: protectedProcedure
      .input(z.object({ state: learnerStateSchema }))
      .mutation(({ ctx, input }) => {
        if (ctx.user.id < 0) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        return saveLearnerState(ctx.user.id, input.state);
      }),
  }),
});

export type AppRouter = typeof appRouter;
