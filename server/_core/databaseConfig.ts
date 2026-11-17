type DatabaseEnvironment = Record<string, string | undefined>;

export type DatabaseConnectionOptions = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function getDatabaseConnectionUrl(
  env: DatabaseEnvironment = process.env,
): string | null {
  const configuredUrl = env.DATABASE_URL?.trim();
  if (configuredUrl) return configuredUrl;

  const required = {
    DATABASE_HOST: env.DATABASE_HOST?.trim(),
    DATABASE_PORT: env.DATABASE_PORT?.trim(),
    DATABASE_USER: env.DATABASE_USER?.trim(),
    DATABASE_PASSWORD: env.DATABASE_PASSWORD,
    DATABASE_NAME: env.DATABASE_NAME?.trim(),
  };
  if (Object.values(required).every((value) => !value)) return null;

  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (missing.length) {
    throw new Error(`Database connection is incomplete. Set: ${missing.join(", ")}.`);
  }

  const port = Number(required.DATABASE_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_PORT must be a valid TCP port.");
  }

  const url = new URL("mysql://localhost");
  url.hostname = required.DATABASE_HOST!;
  url.port = String(port);
  url.username = required.DATABASE_USER!;
  url.password = required.DATABASE_PASSWORD!;
  url.pathname = `/${encodeURIComponent(required.DATABASE_NAME!)}`;
  return url.toString();
}

export function getDatabaseConnectionOptions(
  env: DatabaseEnvironment = process.env,
): DatabaseConnectionOptions | null {
  const connectionUrl = getDatabaseConnectionUrl(env);
  if (!connectionUrl) return null;

  const url = new URL(connectionUrl);
  if (url.protocol !== "mysql:") {
    throw new Error("Database URL must use the mysql:// protocol.");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!database) throw new Error("Database name is missing from the database connection.");

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}
