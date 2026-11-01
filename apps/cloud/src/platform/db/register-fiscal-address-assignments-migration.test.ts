import { drizzle } from "drizzle-orm/pglite";
import { describe, expect, it } from "vitest";
import { DrizzleExceptionShareYearReader } from "../../fiscal/drizzle-exception-share-year-reader.js";
import {
  type DatabaseBeforeMigration,
  databaseBeforeMigration,
  type SqlOnlyDatabase,
} from "./test-support/migration-under-test.js";

interface Configuration {
  at: string;
  previous?: { number: number; address: string; version: number };
  next: { number: number; address: string; version: number };
}

async function databaseWithRegisters(names: string[]): Promise<DatabaseBeforeMigration> {
  const database = await databaseBeforeMigration("_register_fiscal_address_assignments");
  await database.query(
    `insert into registers (location_id, name)
     select location.id, names.name
       from (select id from locations limit 1) as location, unnest($1::text[]) as names (name)`,
    [names],
  );
  await database.query(
    `insert into users (first_name, email, location_id)
     select 'Ada Lucero', 'ada@example.com', id from locations limit 1`,
  );
  await database.query(
    `insert into fiscal_addresses (name, street_address)
     values ('Deposito Central', 'Calle Ficticia 123'),
            ('Local Norte', 'Calle Ficticia 456'),
            ('Local Sur', 'Calle Ficticia 789')`,
  );
  return database;
}

async function configureRegister(
  database: SqlOnlyDatabase,
  register: string,
  current: { number: number; address: string; version: number },
): Promise<void> {
  await database.query(
    `insert into point_of_sale_claims (point_of_sale_number, register_id, mechanism, claimed_by)
     select $2, r.id, 'real_time', u.id from registers r, users u where r.name = $1`,
    [register, current.number],
  );
  await database.query(
    `insert into register_points_of_sale (register_id, point_of_sale_number, fiscal_address_id, version)
     select r.id, $2, f.id, $4 from registers r, fiscal_addresses f where r.name = $1 and f.name = $3`,
    [register, current.number, current.address, current.version],
  );
}

async function auditConfiguration(
  database: SqlOnlyDatabase,
  register: string,
  { at, previous, next }: Configuration,
): Promise<void> {
  const { rows } = await database.query<{ name: string; id: string }>(
    "select name, id from fiscal_addresses",
  );
  const auditValueOf = (configuration: Configuration["next"]) => ({
    point_of_sale_number: configuration.number,
    fiscal_address_id: rows.find(({ name }) => name === configuration.address)?.id,
    version: configuration.version,
  });
  await database.query(
    `insert into audit_log (entity, entity_id, actor_id, at, previous_value, new_value)
     select 'register_point_of_sale', r.id, u.id, $2, $3::jsonb, $4::jsonb
       from registers r, users u where r.name = $1`,
    [
      register,
      at,
      previous ? JSON.stringify(auditValueOf(previous)) : null,
      JSON.stringify(auditValueOf(next)),
    ],
  );
}

async function insertReceipt(
  database: SqlOnlyDatabase,
  register: string,
  { number, receivedAt }: { number: number; receivedAt: string },
): Promise<void> {
  await database.query(
    `insert into fiscal_requests
       (fiscal_document_id, register_id, sale_id, point_of_sale, number, issued_on, total,
        buyer_tax_status_code, received_at, not_after, answer_kind, authorization_code,
        authorization_code_due_on, answered_at)
     select gen_random_uuid(), r.id, gen_random_uuid(), 7, $2, ($3::timestamptz)::date, 4800,
            5, $3::timestamptz, $3::timestamptz + interval '1 minute', 'authorized', '75123456789012',
            ($3::timestamptz)::date + 10, $3::timestamptz + interval '2 seconds'
       from registers r where r.name = $1`,
    [register, number, receivedAt],
  );
}

async function insertCaeaInvoice(
  database: SqlOnlyDatabase,
  register: string,
  { number, generatedAt }: { number: number; generatedAt: string },
): Promise<void> {
  await database.query(
    `insert into offline_fiscal_documents
       (id, sale_id, register_id, point_of_sale, document_type, number, issued_on, generated_at,
        generation_stamp, offline_authorization_code, fortnight_start, fortnight_end,
        buyer_document_type, buyer_document_number, buyer_tax_status_code, total, net_amount,
        cause, recorded_at)
     select gen_random_uuid(), gen_random_uuid(), r.id, 8, 'factura_c', $2, ($3::timestamptz)::date,
            $3::timestamptz, '20261020120000', '21403471111111', '2026-10-16', '2026-10-31',
            99, 0, 5, 3000, 3000, 'no_connectivity', $3::timestamptz + interval '30 minutes'
       from registers r where r.name = $1`,
    [register, number, generatedAt],
  );
}

async function assignmentsOf(migrated: SqlOnlyDatabase) {
  const { rows } = await migrated.query(
    `select r.name as register, f.name as address,
            case when a.assigned_at = '-infinity' then 'since ever'
                 else to_char(a.assigned_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI"Z"') end as since
       from register_fiscal_address_assignments a
       join registers r on r.id = a.register_id
       join fiscal_addresses f on f.id = a.fiscal_address_id
      order by r.name, a.assigned_at`,
  );
  return rows;
}

const MOVE_AT = "2026-10-15T12:00:00Z";

async function databaseWithRegisterMovedFromCentralToNorte() {
  const database = await databaseWithRegisters(["Caja 1"]);
  await configureRegister(database, "Caja 1", { number: 7, address: "Local Norte", version: 2 });
  await auditConfiguration(database, "Caja 1", {
    at: "2026-09-01T12:00:00Z",
    next: { number: 7, address: "Deposito Central", version: 1 },
  });
  await auditConfiguration(database, "Caja 1", {
    at: MOVE_AT,
    previous: { number: 7, address: "Deposito Central", version: 1 },
    next: { number: 7, address: "Local Norte", version: 2 },
  });
  return database;
}

describe("the register fiscal address assignments migration applied over a database that already holds data", {
  timeout: 30_000,
}, () => {
  it("assigns a register whose configuration left no audit row its current fiscal address since before any voucher, and none to a register never configured", async () => {
    const database = await databaseWithRegisters(["Caja 1", "Caja 2", "Caja 3"]);
    await configureRegister(database, "Caja 1", {
      number: 7,
      address: "Deposito Central",
      version: 1,
    });
    await configureRegister(database, "Caja 2", { number: 8, address: "Local Norte", version: 1 });

    const migrated = await database.applyMigration();

    expect(await assignmentsOf(migrated)).toEqual([
      { register: "Caja 1", address: "Deposito Central", since: "since ever" },
      { register: "Caja 2", address: "Local Norte", since: "since ever" },
    ]);
  });

  it("assigns a register moved to another fiscal address its first address since before any voucher and each later one from the instant of the move", async () => {
    const database = await databaseWithRegisterMovedFromCentralToNorte();

    const migrated = await database.applyMigration();

    expect(await assignmentsOf(migrated)).toEqual([
      { register: "Caja 1", address: "Deposito Central", since: "since ever" },
      { register: "Caja 1", address: "Local Norte", since: "2026-10-15T12:00Z" },
    ]);
  });

  it("counts each voucher of a moved register under the fiscal address it had when the voucher was issued", async () => {
    const database = await databaseWithRegisterMovedFromCentralToNorte();
    await insertReceipt(database, "Caja 1", { number: 1, receivedAt: "2026-09-10T13:00:00Z" });
    await insertReceipt(database, "Caja 1", { number: 2, receivedAt: "2026-10-15T11:59:00Z" });
    await insertCaeaInvoice(database, "Caja 1", { number: 1, generatedAt: "2026-10-20T15:00:00Z" });

    const migrated = await database.applyMigration();
    const reader = new DrizzleExceptionShareYearReader(
      drizzle(await migrated.applyEveryLaterMigration()),
    );
    const { rows } = await migrated.query<{ name: string; id: string }>(
      "select name, id from fiscal_addresses",
    );
    const addressId = (name: string) => rows.find((row) => row.name === name)?.id ?? "";
    const countsOf = async (name: string) =>
      (await reader.monthlyVoucherCounts({ fiscalAddressId: addressId(name), year: 2026 })).sort(
        (a, b) => a.month.localeCompare(b.month),
      );

    expect(await countsOf("Deposito Central")).toEqual([
      { month: "2026-09", exceptionCount: 0, totalCount: 1 },
      { month: "2026-10", exceptionCount: 0, totalCount: 1 },
    ]);
    expect(await countsOf("Local Norte")).toEqual([
      { month: "2026-10", exceptionCount: 1, totalCount: 1 },
    ]);
  });

  it("adds no assignment for a configuration that changed only the point of sale number", async () => {
    const database = await databaseWithRegisters(["Caja 1"]);
    await configureRegister(database, "Caja 1", {
      number: 9,
      address: "Deposito Central",
      version: 2,
    });
    await auditConfiguration(database, "Caja 1", {
      at: "2026-09-01T12:00:00Z",
      next: { number: 7, address: "Deposito Central", version: 1 },
    });
    await auditConfiguration(database, "Caja 1", {
      at: MOVE_AT,
      previous: { number: 7, address: "Deposito Central", version: 1 },
      next: { number: 9, address: "Deposito Central", version: 2 },
    });

    const migrated = await database.applyMigration();

    expect(await assignmentsOf(migrated)).toEqual([
      { register: "Caja 1", address: "Deposito Central", since: "since ever" },
    ]);
  });

  it("assigns the address of the later configuration when two changes of a register share their instant", async () => {
    const database = await databaseWithRegisters(["Caja 1"]);
    await configureRegister(database, "Caja 1", { number: 7, address: "Local Sur", version: 3 });
    await auditConfiguration(database, "Caja 1", {
      at: "2026-09-01T12:00:00Z",
      next: { number: 7, address: "Deposito Central", version: 1 },
    });
    await auditConfiguration(database, "Caja 1", {
      at: MOVE_AT,
      previous: { number: 7, address: "Local Norte", version: 2 },
      next: { number: 7, address: "Local Sur", version: 3 },
    });
    await auditConfiguration(database, "Caja 1", {
      at: MOVE_AT,
      previous: { number: 7, address: "Deposito Central", version: 1 },
      next: { number: 7, address: "Local Norte", version: 2 },
    });

    const migrated = await database.applyMigration();

    expect(await assignmentsOf(migrated)).toEqual([
      { register: "Caja 1", address: "Deposito Central", since: "since ever" },
      { register: "Caja 1", address: "Local Sur", since: "2026-10-15T12:00Z" },
    ]);
  });
});
