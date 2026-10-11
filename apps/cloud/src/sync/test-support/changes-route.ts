import { type ChangesPage, changesPageSchema } from "@purosur/contracts";
import {
  type ConfigureRegisterPointOfSaleInput,
  configureRegisterPointOfSale,
} from "@purosur/domain/fiscal/use-cases";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import Fastify, { type FastifyInstance } from "fastify";
import { expect } from "vitest";
import { DrizzleRegisterPointOfSaleStore } from "../../fiscal/drizzle-register-point-of-sale-store.js";
import { fiscalAddresses, registers, users } from "../../platform/db/schema.js";
import { registerRouteAccess } from "../../sessions/route-access.js";
import type { TestDatabase } from "../../test-support/build-test-database.js";
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

type Database = TestDatabase["db"];

export async function insertRegister(
  db: Database,
  locationId: string,
  name: string,
): Promise<string> {
  const [register] = await db
    .insert(registers)
    .values({ locationId, name })
    .returning({ id: registers.id });
  if (!register) {
    throw new Error("test setup: seeding the register returned no row");
  }
  return register.id;
}

export async function insertFiscalAddress(
  db: Database,
  name = "Deposito Central",
): Promise<string> {
  const [fiscalAddress] = await db
    .insert(fiscalAddresses)
    .values({ name, streetAddress: "Calle Ficticia 123, CABA" })
    .returning({ id: fiscalAddresses.id });
  if (!fiscalAddress) {
    throw new Error("test setup: seeding the fiscal address returned no row");
  }
  return fiscalAddress.id;
}

export async function insertActor(
  db: Database,
  locationId: string,
  email = "ada@example.com",
): Promise<string> {
  const [actor] = await db
    .insert(users)
    .values({ firstName: "Ada Lucero", email, locationId })
    .returning({ id: users.id });
  if (!actor) {
    throw new Error("test setup: seeding the actor returned no row");
  }
  return actor.id;
}

export async function configurePointOfSale(
  db: Database,
  now: Date,
  input: ConfigureRegisterPointOfSaleInput,
): Promise<void> {
  const outcome = await configureRegisterPointOfSale(
    new DrizzleRegisterPointOfSaleStore(db, () => now),
    input,
  );
  if (outcome.kind !== "configured") {
    throw new Error(`test setup: configuring ended as ${outcome.kind}`);
  }
}
