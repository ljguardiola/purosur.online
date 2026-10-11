import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import { expect } from "vitest";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import { type ChangesRouteOptions, registerChangesRoute } from "../changes-route.js";

export function buildChangesRouteApp<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: Omit<ChangesRouteOptions<TQueryResult>, "db" | "rotationKey" | "keysEncryptionKey">,
): FastifyInstance {
  const app = Fastify();
  registerRouteAccess(app);
  registerChangesRoute(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    ...options,
  });
  return app;
}

export async function pulledPage(
  app: FastifyInstance,
  since: number,
  deviceToken: string,
  otherQuery: Record<string, string> = {},
): Promise<ChangesPage> {
  const query = new URLSearchParams({ ...otherQuery, since: String(since) });
  const response = await app.inject({
    method: "GET",
    url: `/changes?${query}`,
    headers: { authorization: `Bearer ${deviceToken}` },
  });
  expect(response.statusCode).toBe(200);
  return changesPageSchema.parse(response.json());
}
