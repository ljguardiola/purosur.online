import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { insertRegisterWithPointOfSale } from "../../fiscal/test-support/authorization-request-fixtures.js";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

const ANSWERED_AT = "2026-10-06T15:00:02.000Z";

async function migratedDatabaseWithRequestsAnswered() {
  const folder = await mkdtemp(join(tmpdir(), "unclear-authorization-codes-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  const entry = await findMigrationEntry(
    "_unclear_authorization_codes",
    "test setup: no unclear authorization codes migration in the journal",
  );
  await migrationsFolderBefore(folder, entry);
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());

  const registerId = await insertRegisterWithPointOfSale(drizzle(client), {
    pointOfSaleNumber: 7,
    name: "caja-1",
  });
  const answer = async (number: number, answerKind: string) => {
    const { rows } = await client.query<{ fiscal_document_id: string }>(
      `insert into fiscal_requests
         (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
          buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, answered_at)
       values (gen_random_uuid(), $1, gen_random_uuid(), 7, $2, '2026-10-06', 1500, 5, '{}',
               $3, $3, $4, $3)
       returning fiscal_document_id`,
      [registerId, number, ANSWERED_AT, answerKind],
    );
    return (rows[0] as { fiscal_document_id: string }).fiscal_document_id;
  };
  const unclearId = await answer(1, "unclear");
  const notAttemptedId = await answer(2, "not_attempted");

  await addMigrationEntry(folder, entry);
  await migrate(drizzle(client), { migrationsFolder: folder });
  return { client, unclearId, notAttemptedId };
}

describe("the unclear authorization codes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives an already unclear request no codes and leaves the other answers without any", async () => {
    const { client, unclearId, notAttemptedId } = await migratedDatabaseWithRequestsAnswered();

    const { rows } = await client.query(
      "select fiscal_document_id, unclear_codes from fiscal_requests order by number",
    );

    expect(rows).toEqual([
      { fiscal_document_id: unclearId, unclear_codes: [] },
      { fiscal_document_id: notAttemptedId, unclear_codes: null },
    ]);
  });
});
