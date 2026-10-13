import { describe, expect, it } from "vitest";
import { databaseBeforeMigration } from "./test-support/migration-under-test.js";

const ANSWERED_AT = "2026-10-06T15:00:02.000Z";

async function databaseBeforeTheMigration() {
  const database = await databaseBeforeMigration("_unclear_authorization_codes");
  const first = async (sql: string, params: unknown[] = []) => {
    const { rows } = await database.query<{ id: string }>(sql, params);
    return rows[0]?.id as string;
  };
  const locationId = await first("select id from locations limit 1");
  const actorId = await first(
    "insert into users (first_name, email, location_id) values ('Marta Quiroga', 'caja-1@example.com', $1) returning id",
    [locationId],
  );
  const fiscalAddressId = await first(
    "insert into fiscal_addresses (name, street_address) values ('Deposito caja-1', 'Calle Ficticia 123, CABA') returning id",
  );
  const registerId = await first(
    "insert into registers (location_id, name) values ($1, 'caja-1') returning id",
    [locationId],
  );
  await database.query(
    "insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by) values (7, $1, 'real_time', $2)",
    [registerId, actorId],
  );
  await database.query(
    "insert into register_points_of_sale (register_id, point_of_sale_number, fiscal_address_id, version) values ($1, 7, $2, 0)",
    [registerId, fiscalAddressId],
  );
  const answer = async (number: number, answerKind: string | null) => {
    const { rows } = await database.query<{ fiscal_document_id: string }>(
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
  const answerWithCodes = (number: number, answerKind: string | null, codes: number[] | null) =>
    database.query(
      `insert into fiscal_requests
         (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
          buyer_tax_status_code, sale_event, received_at, not_after, answer_kind, unclear_codes,
          answered_at)
       values (gen_random_uuid(), $1, gen_random_uuid(), 7, $2, '2026-10-06', 1500, 5, '{}',
               $3, $3, $4, $5, $6)`,
      [
        registerId,
        number,
        ANSWERED_AT,
        answerKind,
        codes,
        answerKind === null ? null : ANSWERED_AT,
      ],
    );
  return { database, answer, answerWithCodes };
}

const REFUSED_BY_THE_CODES_CHECK = { constraint: "fiscal_requests_unclear_codes_check" };

describe("the unclear authorization codes migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("gives an already unclear request no codes and leaves the other answers without any", async () => {
    const { database, answer } = await databaseBeforeTheMigration();
    const unclearId = await answer(1, "unclear");
    const notAttemptedId = await answer(2, "not_attempted");
    const migrated = await database.applyMigration();

    const { rows } = await migrated.query(
      "select fiscal_document_id, unclear_codes from fiscal_requests order by number",
    );

    expect(rows).toEqual([
      { fiscal_document_id: unclearId, unclear_codes: [] },
      { fiscal_document_id: notAttemptedId, unclear_codes: null },
    ]);
  });

  it("accepts an unclear answer with the codes the tax authority gave", async () => {
    const { database, answerWithCodes } = await databaseBeforeTheMigration();
    const migrated = await database.applyMigration();

    await answerWithCodes(1, "unclear", [10016, 600]);

    const { rows } = await migrated.query("select unclear_codes from fiscal_requests");
    expect(rows).toEqual([{ unclear_codes: [10016, 600] }]);
  });

  it("refuses an unclear answer without its codes", async () => {
    const { database, answerWithCodes } = await databaseBeforeTheMigration();
    await database.applyMigration();

    await expect(answerWithCodes(1, "unclear", null)).rejects.toMatchObject(
      REFUSED_BY_THE_CODES_CHECK,
    );
  });

  it.each(["not_attempted", null])(
    "refuses codes on a request whose answer is %s",
    async (answerKind) => {
      const { database, answerWithCodes } = await databaseBeforeTheMigration();
      await database.applyMigration();

      await expect(answerWithCodes(1, answerKind, [])).rejects.toMatchObject(
        REFUSED_BY_THE_CODES_CHECK,
      );
    },
  );
});
