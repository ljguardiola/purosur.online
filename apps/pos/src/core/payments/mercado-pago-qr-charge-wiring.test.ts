import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createMercadoPagoQrCharging } from "./mercado-pago-qr-charge-wiring";

const NOW = new Date("2026-10-09T12:00:00.000Z");

let database: LocalDatabase;

function gate() {
  return createActionGate({
    store: new SqliteSignInStore(database),
    signedInPerson: createSignedInPerson(),
    readPepper: async () => undefined,
    hashPin: async () => "",
    now: () => NOW,
  });
}

function cloudClient(requests: { url: string; init: RequestInit }[]) {
  return {
    cloudUrl: "https://cloud.example",
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ code: "not_found", message: "x", details: [] }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    },
    sleep: async () => {},
  };
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
});

afterEach(() => {
  database.close();
});

describe("the register's Mercado Pago QR charging", () => {
  it("offers no QR charge without a local database, a sign-in gate or a cloud", () => {
    const common = {
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => undefined,
      now: () => NOW,
      ids: { next: () => "id" },
    };

    for (const charging of [
      createMercadoPagoQrCharging({
        ...common,
        database: undefined,
        gate: gate(),
        cloudClient: cloudClient([]),
      }),
      createMercadoPagoQrCharging({
        ...common,
        database,
        gate: undefined,
        cloudClient: cloudClient([]),
      }),
      createMercadoPagoQrCharging({ ...common, database, gate: gate(), cloudClient: undefined }),
    ]) {
      expect(charging.start).toBeUndefined();
      expect(charging.follow).toBeUndefined();
      expect(charging.abandon).toBeUndefined();
    }
  });

  it("reads a QR order's state from the cloud's address with the device token", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const signedIn = createSignedInPerson();
    database.exec(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
       INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
       INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
       INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);
       INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES ('qr-1', 'sale-1', 'SALE', 'QR', 'MERCADOPAGO_QR', 3000, 'PENDING', '2026-10-09T11:59:00.000Z', '2026-10-09T12:02:00.000Z');`,
    );
    signedIn.set("u1");
    const charging = createMercadoPagoQrCharging({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson: signedIn,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      cloudClient: cloudClient(requests),
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => "key",
      now: () => NOW,
      ids: { next: () => "id" },
    });

    expect(await charging.follow?.({ paymentTransactionId: "qr-1" })).toEqual({
      kind: "waiting",
      remaining_seconds: 120,
    });
    expect(requests.map(({ url, init }) => [url, init.method, init.headers])).toEqual([
      [
        "https://cloud.example/api/payments/mercado-pago-qr/qr-1",
        "GET",
        { authorization: "Bearer prefix.secret" },
      ],
    ]);
  });

  it("asks the cloud to cancel a QR order at its cancel address with the device token", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const signedIn = createSignedInPerson();
    database.exec(
      `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
       INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
       INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
       INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
         VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
       INSERT INTO sales (id, register_id, device_id, session_id, actor_id, state, occurred_at)
         VALUES ('sale-1', 'register-1', 'device-1', 'session-1', 'u1', 'OPEN', NULL);
       INSERT INTO payment_transactions (id, sale_id, kind, method, provider, amount, state, occurred_at, wait_ends_at)
         VALUES ('qr-1', 'sale-1', 'SALE', 'QR', 'MERCADOPAGO_QR', 3000, 'PENDING', '2026-10-09T11:59:00.000Z', '2026-10-09T12:02:00.000Z');`,
    );
    signedIn.set("u1");
    const charging = createMercadoPagoQrCharging({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson: signedIn,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      cloudClient: cloudClient(requests),
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => Buffer.alloc(32, 7).toString("base64"),
      now: () => NOW,
      ids: { next: () => "id" },
    });

    expect(await charging.abandon?.({ paymentTransactionId: "qr-1" })).toEqual({
      kind: "replaced",
    });
    expect(requests.map(({ url, init }) => [url, init.method, init.headers])).toEqual([
      [
        "https://cloud.example/api/payments/mercado-pago-qr/qr-1/cancel",
        "POST",
        { authorization: "Bearer prefix.secret" },
      ],
    ]);
  });
});
