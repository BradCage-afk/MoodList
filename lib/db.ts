// App-side Postgres pool (Neon). Serverless-friendly: the pool is cached on
// globalThis so hot lambda invocations reuse connections instead of
// re-handshaking TLS on every request.
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __moodlistPool: Pool | undefined;
}

export function db(): Pool {
  if (!global.__moodlistPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    global.__moodlistPool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30_000,
    });
  }
  return global.__moodlistPool;
}
