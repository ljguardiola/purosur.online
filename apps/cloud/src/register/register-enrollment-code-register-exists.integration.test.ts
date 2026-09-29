import { randomUUID } from "node:crypto";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postgresErrorChain } from "../platform/db/postgres-error-chain.js";
import { registerEnrollmentCodes } from "../platform/db/schema.js";
import {
  createIntegrationDatabase,
  type IntegrationDatabase,
} from "../test-support/integration-database.js";

let integrationDb: IntegrationDatabase;
let sql: ReturnType<typeof postgres>;
let db: PostgresJsDatabase<Record<string, never>>;

beforeAll(async () => {
  integrationDb = await createIntegrationDatabase("register_enrollment_code_register_exists");
  sql = postgres(integrationDb.databaseUrl, { max: 1 });
  db = drizzle(sql);
}, 60_000);

afterAll(async () => {
  await sql.end({ timeout: 1 });
  await integrationDb.close();
});

describe("the register enrollment codes table on a real Postgres", () => {
  it("rejects a code for a register that does not exist", async () => {
    const issuedAt = new Date();

    await expect(
      db.insert(registerEnrollmentCodes).values({
        registerId: randomUUID(),
        codeLookup: "ABCD",
        codeHash: "hash",
        issuedAt,
        expiresAt: new Date(issuedAt.getTime() + 60_000),
      }),
    ).rejects.toSatisfy((error) =>
      postgresErrorChain(error).some(
        (link) => link.constraint === "register_enrollment_codes_register_id_registers_id_fk",
      ),
    );
  });
});
