import { encodePinHash } from "@purosur/contracts";
import { createActionGate } from "../../access/action-gate";
import { derivePinVerifier } from "../../access/pin-verifier";
import { createSignedInPerson } from "../../access/signed-in-person";
import { SqliteSignInStore } from "../../access/sqlite-sign-in-store";
import type { LocalDatabase } from "../../platform/local-database";
import { LOCAL_MIGRATIONS } from "../../platform/local-migrations";
import { migrationClock } from "../../platform/test-support/migration-clock";
import { openLocalDatabase } from "../../platform/test-support/open-local-database";
import { recordCashMovementFor } from "../../register/cash-movement-requests";
import { closeCashSessionFor, openCashSessionFor } from "../../register/cash-session-requests";
import { uuidV7Ids } from "../../register/uuid-v7-ids";
import {
  chargeSaleByTransferFor,
  chargeSaleInCashFor,
  scanProductFor,
} from "../../sales/sale-requests";
import { CloudEventInbox } from "../cloud-event-inbox";
import { SqliteLocalOutbox } from "../sqlite-local-outbox";

const START = Date.parse("2026-10-06T11:00:00.000Z");
const STEP_MS = 4 * 60_000;
const OUTBOX_CHAIN_KEY = Buffer.alloc(32, 7).toString("base64");

const DEVICE = "6f0c2a1e-3b54-4d7a-9c10-5e8a7b2d4f01";
const REGISTER = "a41d9e07-52c3-4b68-8f2e-1c7d3a9b6e02";
const ADA = "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03";
const ROLE = "e2f8a6b4-7d19-4c35-a0e3-9b1c5d7f2a04";
const GRACE = "4a7c1e9d-3b62-4f05-8d1a-6e2b9c5f3a13";
const MANAGER_ROLE = "8c2e5a1f-6d93-4b47-a1c8-3f7d2b9e6a14";
const YERBA = "0b9d4c7e-6a21-4e83-9f5b-3d8e1a2c7b05";
const SUGAR = "5d1a8f3c-9e47-4b02-8c6d-7a3f2e9b1c06";
const COOKIES = "2e6b9d3f-7a15-4c80-b4e2-8d1f5a3c9b15";
const PRICE_LIST = "9a6e2b1d-4c78-4f13-b5a0-8e7d3c1f9a07";
const YERBA_PRICE = "3c8f1d5a-2b96-4e70-a4c9-6f1b8d2e5a08";
const SUGAR_PRICE = "7e4a9c2f-1d63-4b85-9e0a-2c5f7b8d1309";
const COOKIES_PRICE = "6a3d8f1c-2e74-4b59-9c0d-5f8a1e3b7c16";
const DISCOUNT = "b5d2f7a1-8c40-4e96-a3b7-1f9e6c4d2a10";
const BUY_THREE_PAY_TWO = "c9f4b2e7-1a58-4d36-8e0b-4a7c3f9d1e17";
const THRESHOLD = "d3e6a9c1-5f28-4b74-8a0d-9c2e7f1b4a11";
const CATEGORY = "f1a7c3e9-4b52-4d68-9e01-7a3c5b8d2f12";
const PEPPER = Buffer.alloc(32, 9).toString("base64url");
const PIN = "4826";
const PIN_HASH = "hash-of-the-pin";

function expectOutcome(step: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(`The register session's "${step}" ended as "${actual}", not "${expected}"`);
  }
}

function seed(database: ReturnType<typeof openLocalDatabase>): void {
  for (const [role, name, permissions] of [
    [ROLE, "Cajera", ["sell_and_charge", "record_cash_expense"]],
    [MANAGER_ROLE, "Encargada", ["sell_and_charge", "record_cash_expense", "withdraw_cash"]],
  ] as const) {
    database
      .prepare("INSERT INTO roles (id, name, is_administrator, version) VALUES (?, ?, 0, 1)")
      .run(role, name);
    for (const key of permissions) {
      database
        .prepare("INSERT INTO role_permissions (role_id, permission_key, active) VALUES (?, ?, 1)")
        .run(role, key);
    }
  }
  for (const [user, name, role] of [
    [ADA, "Ada", ROLE],
    [GRACE, "Grace", MANAGER_ROLE],
  ]) {
    database
      .prepare(
        "INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES (?, ?, ?, ?, 1, 1)",
      )
      .run(user, name, role, encodePinHash(new Uint8Array(16).fill(1)));
    database
      .prepare("INSERT INTO pin_verifiers (user_id, verifier) VALUES (?, ?)")
      .run(user, derivePinVerifier(PEPPER, PIN_HASH));
  }
  database
    .prepare("INSERT INTO own_register (id, name, version) VALUES (?, 'Caja 1', 1)")
    .run(REGISTER);
  database.prepare("UPDATE sync_state SET device_id = ?").run(DEVICE);
  database
    .prepare(
      "INSERT INTO buyer_identification_thresholds (id, amount, valid_from) VALUES (?, ?, ?)",
    )
    .run(THRESHOLD, 100_000_000, "2026-01-01");
  for (const [id, name, code] of [
    [YERBA, "Yerba", "7790001000011"],
    [SUGAR, "Azucar", "7790001000028"],
    [COOKIES, "Galletitas", "7790001000035"],
  ]) {
    database
      .prepare(
        "INSERT INTO products (id, name, category_id, sale_unit, active, version) VALUES (?, ?, ?, 'UNIT', 1, 1)",
      )
      .run(id, name, CATEGORY);
    database
      .prepare(
        "INSERT INTO product_barcodes (product_id, position, code, active) VALUES (?, 1, ?, 1)",
      )
      .run(id, code);
  }
  for (const [id, product, amount] of [
    [YERBA_PRICE, YERBA, 1500],
    [SUGAR_PRICE, SUGAR, 2400],
    [COOKIES_PRICE, COOKIES, 900],
  ]) {
    database
      .prepare(
        "INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version) VALUES (?, ?, ?, ?, '2026-09-01T00:00:00.000Z', 1)",
      )
      .run(id, product, PRICE_LIST, amount);
  }
  database
    .prepare(
      `INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
       VALUES (?, 'Promo yerba', 'PERCENT_OFF', 10, NULL, NULL, 'PRODUCT', ?, '2026-09-01', '2026-12-31', '[]', 1, 1)`,
    )
    .run(DISCOUNT, YERBA);
  database
    .prepare(
      `INSERT INTO discounts (id, name, kind, percent, buy_qty, pay_qty, target_kind, target_id, valid_from, valid_to, weekdays, active, version)
       VALUES (?, 'Galletitas 3x2', 'BUY_N_PAY_M', NULL, 3, 2, 'PRODUCT', ?, '2026-09-01', '2026-12-31', '[]', 1, 1)`,
    )
    .run(BUY_THREE_PAY_TWO, COOKIES);
}

export interface RegisterSession {
  database: LocalDatabase;
  now: () => Date;
}

export async function withRegisterSession<TResult>(
  use: (session: RegisterSession) => Promise<TResult>,
): Promise<TResult> {
  const database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  try {
    seed(database);

    let ticks = 0;
    let current = new Date(START);
    const now = () => current;
    const nextStep = () => {
      current = new Date(START + ticks * STEP_MS);
      ticks += 1;
    };

    const signedInPerson = createSignedInPerson();
    signedInPerson.set(ADA);
    const deps = () => ({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => PEPPER,
        hashPin: async (pin) => (pin === PIN ? PIN_HASH : "hash-of-another-pin"),
        now,
      }),
      readOutboxChainKey: async () => OUTBOX_CHAIN_KEY,
      now,
      ids: uuidV7Ids,
    });

    nextStep();
    const opened = await openCashSessionFor(deps(), 10_000);
    if (opened.kind !== "opened" || opened.cash_session === null) {
      throw new Error(`The register session's "open the cash session" ended as "${opened.kind}"`);
    }
    nextStep();
    const movement = await recordCashMovementFor(deps(), {
      kind: "CASH_OUT",
      amount: 1800,
      reason: "Compra de bolsas",
      authorization: undefined,
    });
    expectOutcome("record a cash expense", movement.kind, "recorded");
    nextStep();
    const withdrawal = await recordCashMovementFor(deps(), {
      kind: "WITHDRAWAL",
      amount: 1000,
      reason: "Retiro parcial",
      authorization: { user_id: GRACE, pin: PIN },
    });
    expectOutcome("record a withdrawal authorized by PIN", withdrawal.kind, "recorded");
    nextStep();
    const firstScan = await scanProductFor(deps(), "7790001000011");
    expectOutcome("scan the first product", firstScan.kind, "added");
    nextStep();
    const scanned = await scanProductFor(deps(), "7790001000011");
    if (scanned.kind !== "added") {
      throw new Error(`The register session's "scan a product again" ended as "${scanned.kind}"`);
    }
    nextStep();
    const cash = await chargeSaleInCashFor(deps(), { saleId: scanned.sale.id, tendered: 5000 });
    expectOutcome("charge a sale in cash", cash.kind, "completed");
    nextStep();
    const second = await scanProductFor(deps(), "7790001000028");
    if (second.kind !== "added") {
      throw new Error(`The register session's "scan another product" ended as "${second.kind}"`);
    }
    for (const scan of ["first", "second", "third"]) {
      nextStep();
      const cookies = await scanProductFor(deps(), "7790001000035");
      expectOutcome(`scan the ${scan} product on promotion`, cookies.kind, "added");
    }
    nextStep();
    const transfer = await chargeSaleByTransferFor(deps(), { saleId: second.sale.id });
    expectOutcome("charge a sale by transfer", transfer.kind, "completed");
    nextStep();
    const closed = await closeCashSessionFor(deps(), {
      sessionId: opened.cash_session.id,
      countedCash: 9_900,
    });
    expectOutcome("close the cash session", closed.kind, "closed");

    return await use({ database, now });
  } finally {
    database.close();
  }
}

export async function registerSessionPush(): Promise<{
  outboxChainKey: string;
  sentBody: unknown;
}> {
  return withRegisterSession(async ({ database, now }) => {
    const events = await new SqliteLocalOutbox(database, now).unacknowledged(100);
    const lastSeq = events.at(-1)?.device_seq ?? 0;
    const posted: unknown[] = [];
    await new CloudEventInbox({
      post: async (_path, _token, body) => {
        posted.push(body);
        return { kind: "ok", body: { status: "ok", ack_seq: lastSeq } };
      },
      deviceToken: "device-token",
      appVersion: "0.0.0",
      readTelemetry: async () => ({
        wal_size_bytes: 4_120_032,
        disk_free_bytes: 182_536_847_360,
        disk_free_ratio: 0.38,
      }),
    }).push(events);
    if (posted.length !== 1) {
      throw new Error(`The register session posted ${posted.length} pushes, not 1`);
    }
    return { outboxChainKey: OUTBOX_CHAIN_KEY, sentBody: posted[0] };
  });
}
