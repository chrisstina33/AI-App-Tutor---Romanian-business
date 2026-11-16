import { describe, expect, it } from "vitest";
import { getDatabaseConnectionUrl } from "../server/_core/databaseConfig";

describe("database connection settings", () => {
  it("builds a MySQL URL from separate connection fields and safely encodes credentials", () => {
    const connectionUrl = getDatabaseConnectionUrl({
      DATABASE_HOST: "cluster.example.test",
      DATABASE_PORT: "4000",
      DATABASE_USER: "app-user",
      DATABASE_PASSWORD: "p@ss:/#word",
      DATABASE_NAME: "elunariq",
    });

    expect(connectionUrl).not.toBeNull();
    const parsed = new URL(connectionUrl!);
    expect(parsed.hostname).toBe("cluster.example.test");
    expect(parsed.port).toBe("4000");
    expect(parsed.username).toBe("app-user");
    expect(decodeURIComponent(parsed.password)).toBe("p@ss:/#word");
    expect(parsed.pathname).toBe("/elunariq");
  });

  it("prefers an explicitly supplied connection URL", () => {
    expect(getDatabaseConnectionUrl({
      DATABASE_URL: "mysql://user:password@db.example.test:4000/elunariq",
      DATABASE_HOST: "ignored.example.test",
    })).toBe("mysql://user:password@db.example.test:4000/elunariq");
  });

  it("reports missing fields without exposing their values", () => {
    expect(() => getDatabaseConnectionUrl({
      DATABASE_HOST: "cluster.example.test",
      DATABASE_USER: "private-user",
      DATABASE_PASSWORD: "private-password",
    })).toThrow("DATABASE_PORT, DATABASE_NAME");
  });
});
