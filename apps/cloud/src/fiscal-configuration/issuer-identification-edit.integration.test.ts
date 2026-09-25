import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  auditLog,
  ISSUER_IDENTIFICATION_SINGLETON_ID,
  issuerIdentification,
  users,
} from "../db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../recovery/recovery-integration-database.js";
import { seededLocationId } from "../test-support/seeded-location.js";
import { editIssuerIdentification } from "./issuer-identification-edit-route.js";

// PGlite runs every query over one connection, so it can never race two saves for the single
// issuer identification row. This runs them over a real postgres-js pool of more than one
// connection against a real Postgres, the same reasoning `branch-settings-edit.integration.test.ts`
// gives for a branch settings save.
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
    legalName: "Puro Sur SRL",
    grossIncomeRegistration: "CM 901-123456-3",
    activityStartDate: "2020-01-15",
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
      .values({ firstName: "Ada Lovelace", email: `ada-${suffix}@example.com`, locationId })
      .returning({ id: users.id });
    if (!actor) {
      throw new Error("test setup: seeding the actor returned no row");
    }
    const actorId = actor.id;

    const [first, second] = await Promise.all([
      editIssuerIdentification(db, editInput(actorId, { legalName: "Puro Sur - Primera edición" })),
      editIssuerIdentification(db, editInput(actorId, { legalName: "Puro Sur - Segunda edición" })),
    ]);

    const outcomes = [first, second];
    expect(outcomes.filter((outcome) => outcome.kind === "applied")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.kind === "stale_version")).toHaveLength(1);

    const [row] = await db
      .select()
      .from(issuerIdentification)
      .where(eq(issuerIdentification.id, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(row).toMatchObject({ version: 2 });

    const winner = outcomes.find((outcome) => outcome.kind === "applied");
    if (winner?.kind !== "applied") {
      throw new Error("test setup: expected one save to have won the race");
    }
    expect(row?.legalName).toBe(winner.row.legalName);

    const audited = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, ISSUER_IDENTIFICATION_SINGLETON_ID));
    expect(audited.filter((entry) => entry.entity === "issuer_identification")).toHaveLength(1);
  });
});
