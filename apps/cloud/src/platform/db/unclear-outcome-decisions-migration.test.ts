import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, inject, it, onTestFinished } from "vitest";
import { migrateFreshDatabase } from "../../test-support/test-database-snapshot.js";
import {
  addMigrationEntry,
  findMigrationEntry,
  type JournalEntry,
  migrationsFolderBefore,
} from "./test-support/migration-journal-test-helpers.js";

async function unclearOutcomeDecisionsEntry(): Promise<JournalEntry> {
  return findMigrationEntry(
    "_unclear_outcome_decisions",
    "test setup: no unclear-outcome-decisions migration in the journal",
  );
}

const INSERT_REQUEST = `insert into fiscal_requests
  (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
   buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, authorization_code,
   authorization_code_due_on, answered_at, decision, decided_at, adopted_authorization_code,
   adopted_authorization_code_due_on)
  values (gen_random_uuid(), $1, gen_random_uuid(), 3, $2, '2026-10-06', 1500, 5, '{}'::jsonb,
          now(), now(), $3, $4, $5, $6, $7, $8, $9, $10)`;

interface RequestColumns {
  number?: number;
  answerKind?: string | null;
  authorizationCode?: string | null;
  authorizationCodeDueOn?: string | null;
  decision?: string | null;
  decidedAt?: Date | null;
  adoptedCode?: string | null;
  adoptedDueOn?: string | null;
}

function requestValues(
  registerId: string | undefined,
  {
    number = 1,
    answerKind = "unclear",
    authorizationCode = null,
    authorizationCodeDueOn = null,
    decision = null,
    decidedAt = null,
    adoptedCode = null,
    adoptedDueOn = null,
  }: RequestColumns,
) {
  return [
    registerId,
    number,
    answerKind,
    authorizationCode,
    authorizationCodeDueOn,
    answerKind === null ? null : new Date(),
    decision,
    decidedAt,
    adoptedCode,
    adoptedDueOn,
  ];
}

async function databaseBefore() {
  const folder = await mkdtemp(join(tmpdir(), "unclear-outcome-decisions-migration-"));
  onTestFinished(() => rm(folder, { recursive: true, force: true }));
  await migrationsFolderBefore(folder, await unclearOutcomeDecisionsEntry());
  const client = await migrateFreshDatabase(folder, inject("testDatabaseClusterDumpPath"));
  onTestFinished(() => client.close());
  const { rows } = await client.query<{ id: string }>(
    "insert into registers (location_id, name) select id, 'Caja 1' from locations limit 1 returning id",
  );
  const registerId = rows[0]?.id;
  const applyMigration = async () => {
    await addMigrationEntry(folder, await unclearOutcomeDecisionsEntry());
    await migrate(drizzle(client), { migrationsFolder: folder });
  };
  return { client, registerId, applyMigration };
}

async function databaseAfter() {
  const database = await databaseBefore();
  await database.applyMigration();
  return database;
}

describe("the unclear-outcome-decisions migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("keeps every existing request undecided", async () => {
    const { client, registerId, applyMigration } = await databaseBefore();
    await client.query(
      `insert into fiscal_requests
        (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
         buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, answered_at)
        values (gen_random_uuid(), $1, gen_random_uuid(), 3, 1, '2026-10-06', 1500, 5, '{}'::jsonb,
                now(), now(), 'unclear', now())`,
      [registerId],
    );

    await applyMigration();

    const { rows } = await client.query(
      "select answer_kind, decision, decided_at, adopted_authorization_code from fiscal_requests",
    );
    expect(rows).toEqual([
      {
        answer_kind: "unclear",
        decision: null,
        decided_at: null,
        adopted_authorization_code: null,
      },
    ]);
  });

  it.each(["unclear", "not_attempted"])("accepts a release of a %s request", async (answerKind) => {
    const { client, registerId } = await databaseAfter();

    await client.query(
      INSERT_REQUEST,
      requestValues(registerId, { answerKind, decision: "released", decidedAt: new Date() }),
    );

    const { rows } = await client.query("select decision from fiscal_requests");
    expect(rows).toEqual([{ decision: "released" }]);
  });

  it("accepts an adoption with the authorization code and its due date", async () => {
    const { client, registerId } = await databaseAfter();

    await client.query(
      INSERT_REQUEST,
      requestValues(registerId, {
        decision: "adopted",
        decidedAt: new Date(),
        adoptedCode: "74123456789012",
        adoptedDueOn: "2026-10-16",
      }),
    );

    const { rows } = await client.query(
      "select decision, adopted_authorization_code, adopted_authorization_code_due_on::text from fiscal_requests",
    );
    expect(rows).toEqual([
      {
        decision: "adopted",
        adopted_authorization_code: "74123456789012",
        adopted_authorization_code_due_on: "2026-10-16",
      },
    ]);
  });

  it("accepts a conflict", async () => {
    const { client, registerId } = await databaseAfter();

    await client.query(
      INSERT_REQUEST,
      requestValues(registerId, { decision: "conflicting", decidedAt: new Date() }),
    );

    const { rows } = await client.query("select decision from fiscal_requests");
    expect(rows).toEqual([{ decision: "conflicting" }]);
  });

  it.each<[string, RequestColumns]>([
    ["a decision this feature does not know", { decision: "pending", decidedAt: new Date() }],
    ["a decision without the time it was made", { decision: "released" }],
    ["a time of decision without a decision", { decidedAt: new Date() }],
    [
      "an adoption without its authorization code",
      { decision: "adopted", decidedAt: new Date(), adoptedDueOn: "2026-10-16" },
    ],
    [
      "an adoption without its due date",
      { decision: "adopted", decidedAt: new Date(), adoptedCode: "74123456789012" },
    ],
    [
      "an authorization code on a release",
      {
        decision: "released",
        decidedAt: new Date(),
        adoptedCode: "74123456789012",
        adoptedDueOn: "2026-10-16",
      },
    ],
    [
      "a decision on a request that is still waiting for its answer",
      { answerKind: null, decision: "released", decidedAt: new Date() },
    ],
    [
      "a decision on an authorized request",
      {
        answerKind: "authorized",
        authorizationCode: "74123456789012",
        authorizationCodeDueOn: "2026-10-16",
        decision: "released",
        decidedAt: new Date(),
      },
    ],
  ])("refuses %s", async (_case, columns) => {
    const { client, registerId } = await databaseAfter();

    await expect(
      client.query(INSERT_REQUEST, requestValues(registerId, columns)),
    ).rejects.toThrow();
  });
});
