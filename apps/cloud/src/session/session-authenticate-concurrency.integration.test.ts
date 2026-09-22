import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import Fastify, { type FastifyInstance } from "fastify";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInFailures, signInLockouts } from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { registerSessionAuthenticateRoute } from "./session-authenticate-route.js";
import { SIGN_IN_FAILURE_LIMIT } from "./sign-in-lockout.js";

// PGlite serves every query on one connection and serializes transactions outright, so only a
// real Postgres pool can land a burst of requests on this route the way a shared office address
// would. Pool size leaves room for every request to hold a connection at once: sized to the
// burst, an exhausted pool would wait instead of failing, and the assertions below would never
// be reached.
const BACKOFFICE_ORIGIN = "https://staging.purosur.online";
const NOON = new Date("2026-01-05T12:00:00.000Z");
const SOURCE_ADDRESS = "198.51.100.30";
const BURST = SIGN_IN_FAILURE_LIMIT + 1;

let integrationDb: IntegrationDatabase;
let sql: postgres.Sql;
let db: PostgresJsDatabase<Record<string, never>>;
let app: FastifyInstance;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("session_authenticate");
  sql = postgres(integrationDb.databaseUrl, { max: BURST * 4 });
  db = drizzle(sql);
  app = Fastify();
  registerSessionAuthenticateRoute(app, {
    db,
    backofficeOrigin: BACKOFFICE_ORIGIN,
    now: () => NOON,
    delay: async () => {},
  });
}, 60_000);

afterAll(async () => {
  await app.close();
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function postAuthenticate(body: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/users/session/authenticate",
    headers: { origin: BACKOFFICE_ORIGIN, "x-real-ip": SOURCE_ADDRESS },
    payload: body,
  });
}

describe("POST /users/session/authenticate on concurrent connections", () => {
  it("takes no lockout slot for requests with nothing to verify, however many arrive at once", async () => {
    const responses = await Promise.all(Array.from({ length: BURST }, () => postAuthenticate({})));

    for (const response of responses) {
      expect(response.statusCode).toBe(401);
    }
    expect(await db.select().from(signInFailures)).toHaveLength(0);
    expect(await db.select().from(signInLockouts)).toHaveLength(0);
  }, 30_000);
});
