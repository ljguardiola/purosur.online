import { randomUUID } from "node:crypto";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import { editIssuerIdentification } from "@purosur/domain/fiscal/use-cases";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLog,
  ISSUER_IDENTIFICATION_SINGLETON_ID,
  issuerIdentification,
  users,
} from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { DrizzleIssuerIdentificationStore } from "./drizzle-issuer-identification-store.js";

const NOON = new Date("2026-01-05T12:00:00.000Z");

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("issuer_identification_edit");
  sql = postgres(integrationDb.databaseUrl, { max: 4 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

function editInput(actorId: string, overrides: Record<string, unknown> = {}) {
  return {
    actorId,
    legalName: FICTIONAL_LEGAL_NAME,
    grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
    activityStartDate: "2020-01-15",
    authorizedCuit: FICTIONAL_CUIT,
    version: 1,
    ...overrides,
  };
}

describe("two saves racing on the same issuer identification version, on a real Postgres through postgres-js", () => {
  it("applies exactly one of them and reports the other as stale_version", async () => {
    const suffix = randomUUID();
    const locationId = await seededLocationId(db);
    const [actor] = await db
      .insert(users)
      .values({ firstName: "Ada Lucero", email: `ada-${suffix}@example.com`, locationId })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }
    const actorId = actor.id;

    const ports = { store: new DrizzleIssuerIdentificationStore(db, () => NOON) };
    const [first, second] = await Promise.all([
      editIssuerIdentification(
        ports,
        editInput(actorId, { legalName: "Comercio de Prueba - Primera edición" }),
      ),
      editIssuerIdentification(
        ports,
        editInput(actorId, { legalName: "Comercio de Prueba - Segunda edición" }),
      ),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "edited")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "stale_version")).toHaveLength(1);

    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ version: 2 });

    const winner = outcomes.find((outcome) => outcome.kind === "edited");
    if (winner?.kind !== "edited") {
      throw new Error("test setup: expected one save to have won the race");
    }
    expect(row?.legalName).toBe(winner.identification.legalName);

    const audited = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(audited.filter((entry) => entry.entity === "issuer_identification")).toHaveLength(1);
  });
});
