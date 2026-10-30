import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import {
  createCorsMiddleware,
  isLoopbackApiHost,
  trustedExpoWebOrigins,
} from "../server/_core/cors";

let server: Server | null = null;

beforeEach(() => {
  // The real Mobile runtime injects both values. Each test owns its complete origin input so
  // a platform URL cannot leak into a case that intentionally exercises only loopback data.
  vi.stubEnv("EXPO_PACKAGER_PROXY_URL", "");
  vi.stubEnv("EXPO_WEB_PREVIEW_URL", "");
  vi.stubEnv("CORS_ALLOWED_ORIGINS", "");
});

afterEach(async () => {
  vi.unstubAllEnvs();
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = null;
});

async function testServer(
  localApi = true,
  allowedOrigins = new Set([
    "https://8081-sandbox.example.test",
    "https://8328-sandbox.example.test",
  ]),
): Promise<string> {
  const app = express();
  app.use(
    createCorsMiddleware(
      allowedOrigins,
      () => localApi,
    ),
  );
  app.get("/read", (_req, res) => res.json({ ok: true }));
  app.post("/write", (_req, res) => res.json({ ok: true }));
  server = app.listen(0);
  await new Promise<void>((resolve) => server?.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing test port");
  return `http://127.0.0.1:${address.port}`;
}

describe("Mobile API origin isolation", () => {
  it("derives only the paired 8328 preview from the platform 8081 origin", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(
      "EXPO_PACKAGER_PROXY_URL",
      "https://8081-sandbox.region.preview.example.test",
    );
    vi.stubEnv(
      "EXPO_WEB_PREVIEW_URL",
      "https://8328-sandbox.region.preview.example.test",
    );
    expect([...trustedExpoWebOrigins()].sort()).toEqual([
      "https://8081-sandbox.region.preview.example.test",
      "https://8328-sandbox.region.preview.example.test",
    ]);
  });

  it("allows an explicitly configured deployed frontend origin", async () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://elunariq.example");
    const base = await testServer(true, trustedExpoWebOrigins());
    const response = await fetch(`${base}/read`, {
      headers: { Origin: "https://elunariq.example" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://elunariq.example",
    );

    const preflight = await fetch(`${base}/write`, {
      method: "OPTIONS",
      headers: {
        Origin: "https://elunariq.example",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "https://elunariq.example",
    );
  });

  it("rejects malformed configured frontend origins", () => {
    vi.stubEnv("CORS_ALLOWED_ORIGINS", "https://elunariq.example/");
    expect(() => trustedExpoWebOrigins()).toThrow(
      "Invalid origin in CORS_ALLOWED_ORIGINS",
    );
  });

  it.each(["GET", "POST", "OPTIONS"])(
    "rejects credentialed %s from an unpaired web origin",
    async (method) => {
      const base = await testServer();
      const response = await fetch(`${base}/${method === "GET" ? "read" : "write"}`, {
        method,
        headers: { Origin: "https://evil.example.test" },
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    },
  );

  it.each([
    "https://3001-sandbox.example.test",
    "https://8328-other-sandbox.example.test",
    "https://evil.example.test",
  ])("rejects an unpaired preview origin: %s", async (origin) => {
    const base = await testServer();
    const response = await fetch(`${base}/read`, { headers: { Origin: origin } });
    expect(response.status).toBe(403);
  });

  it.each([
    "https://8081-sandbox.example.test",
    "https://8328-sandbox.example.test",
  ])("allows a paired Expo Web origin: %s", async (origin) => {
    const base = await testServer();
    const web = await fetch(`${base}/read`, {
      headers: { Origin: origin },
    });
    expect(web.status).toBe(200);
    expect(web.headers.get("access-control-allow-origin")).toBe(origin);
    expect(web.headers.get("access-control-allow-credentials")).toBe("true");
    expect(web.headers.get("vary")).toContain("Origin");
  });

  it("allows only the exact dynamic packager and Dashboard origins for a loopback API", async () => {
    vi.stubEnv("EXPO_PACKAGER_PROXY_URL", "http://localhost:48081");
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "http://127.0.0.1:48328");
    const base = await testServer();
    for (const origin of ["http://localhost:48081", "http://127.0.0.1:48328"]) {
      const local = await fetch(`${base}/read`, { headers: { Origin: origin } });
      expect(local.status).toBe(200);
      expect(local.headers.get("access-control-allow-origin")).toBe(origin);
    }
    const guessed = await fetch(`${base}/read`, {
      headers: { Origin: "http://localhost:8081" },
    });
    expect(guessed.status).toBe(403);
    expect(isLoopbackApiHost("127.0.0.1")).toBe(true);
    expect(isLoopbackApiHost("127.0.0.42")).toBe(true);
    expect(isLoopbackApiHost("app.localhost.")).toBe(true);
    expect(isLoopbackApiHost("[::1]")).toBe(true);
    expect(isLoopbackApiHost("[::ffff:7f00:1]")).toBe(true);
    expect(isLoopbackApiHost("3000-sandbox.preview.example.test")).toBe(false);
  });

  it("rejects localhost for a remote API even in development mode", async () => {
    vi.stubEnv("EXPO_PACKAGER_PROXY_URL", "http://localhost:48081");
    vi.stubEnv("EXPO_WEB_PREVIEW_URL", "http://127.0.0.1:48328");
    const base = await testServer(false);
    for (const origin of ["http://localhost:48081", "http://127.0.0.1:48328"]) {
      const remote = await fetch(`${base}/read`, { headers: { Origin: origin } });
      expect(remote.status).toBe(403);
    }
  });

  it.each([
    "http://localhost.:8081",
    "http://app.localhost:8081",
    "http://127.0.0.42:8081",
    "http://2130706433:8081",
    "http://[0:0:0:0:0:0:0:1]:8081",
    "http://[::ffff:127.0.0.1]:8081",
    "https://localhost:8081",
    "http://127.0.0.42:9090",
    "https://[::ffff:127.0.0.1]:8081",
  ])("never promotes a loopback-equivalent origin into a remote API allowlist: %s", async (origin) => {
    const previousPackager = process.env.EXPO_PACKAGER_PROXY_URL;
    try {
      process.env.EXPO_PACKAGER_PROXY_URL = origin;
      expect([...trustedExpoWebOrigins()]).toEqual([]);
      const base = await testServer(
        false,
        new Set([origin]),
      );
      const remote = await fetch(`${base}/read`, {
        headers: { Origin: origin },
      });
      expect(remote.status).toBe(403);
    } finally {
      if (previousPackager === undefined) delete process.env.EXPO_PACKAGER_PROXY_URL;
      else process.env.EXPO_PACKAGER_PROXY_URL = previousPackager;
    }
  });

  it("keeps native no-Origin requests separate", async () => {
    const base = await testServer();
    const native = await fetch(`${base}/write`, { method: "POST" });
    expect(native.status).toBe(200);
    expect(native.headers.get("access-control-allow-origin")).toBeNull();
  });
});
