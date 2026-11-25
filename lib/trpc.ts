import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@/server/routers";
import { getApiBaseUrl } from "@/constants/api";
import { readAuthToken } from "@/lib/auth-session";

export const trpc = createTRPCReact<AppRouter>();

const fetchWithTutorTimeout: typeof fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.includes("assistant.chat")) return fetch(input, init);

  const controller = new AbortController();
  const originalSignal = init?.signal;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 90_000);
  const abortWithOriginalSignal = () => controller.abort();

  if (originalSignal?.aborted) {
    abortWithOriginalSignal();
  } else {
    originalSignal?.addEventListener("abort", abortWithOriginalSignal, { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal })
    .then(async (response) => {
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    })
    .catch((error: unknown) => {
      if (timedOut) throw new Error("Tutor request timed out after 90 seconds");
      throw error;
    })
    .finally(() => {
      clearTimeout(timeout);
      originalSignal?.removeEventListener("abort", abortWithOriginalSignal);
    });
};

export function createTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `${getApiBaseUrl()}/api/trpc`,
        transformer: superjson,
        fetch: fetchWithTutorTimeout,
        headers: async () => {
          const token = await readAuthToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
