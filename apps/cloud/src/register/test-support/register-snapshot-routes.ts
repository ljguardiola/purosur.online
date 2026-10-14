import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import { registerRouteAccess } from "../../sessions/route-access.js";
import { TEST_DEVICE_TOKEN_ROTATION_KEY } from "../../test-support/device-token-rotation-key.js";
import { TEST_INSTALLATION_KEYS_ENCRYPTION_KEY } from "../../test-support/installation-keys-encryption-key.js";
import {
  type RegisterSnapshotRoutesOptions,
  registerRegisterSnapshotRoutes,
} from "../register-snapshot-routes.js";

export function buildRegisterSnapshotRoutesApp<TQueryResult extends PgQueryResultHKT>(
  db: PgDatabase<TQueryResult>,
  options: Omit<
    RegisterSnapshotRoutesOptions<TQueryResult>,
    "db" | "rotationKey" | "keysEncryptionKey"
  >,
): FastifyInstance {
  const app = Fastify();
  registerRouteAccess(app);
  registerRegisterSnapshotRoutes(app, {
    db,
    rotationKey: TEST_DEVICE_TOKEN_ROTATION_KEY,
    keysEncryptionKey: TEST_INSTALLATION_KEYS_ENCRYPTION_KEY,
    ...options,
  });
  return app;
}
