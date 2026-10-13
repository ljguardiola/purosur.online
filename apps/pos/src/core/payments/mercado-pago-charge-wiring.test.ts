import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { currentSaleFor } from "../sales/sale-requests";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { createMercadoPagoCharging } from "./mercado-pago-charge-wiring";
import {
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const PROVIDER_UNAVAILABLE = { status: 503, code: "payment_provider_unavailable" };

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

const POINT_PAYMENT_ID = "0b6f2c1e-4a7d-4c1e-9f2a-5d3e8b7a6c41";

function cloudClient(
  requests: { url: string; init: RequestInit }[],
  refusal: { status: number; code: string } = { status: 404, code: "not_found" },
) {
  return {
    cloudUrl: "https://cloud.example",
    fetch: async (url: string, init: RequestInit) => {
      requests.push({ url, init });
      return new Response(JSON.stringify({ code: refusal.code, message: "x", details: [] }), {
        status: refusal.status,
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
      createMercadoPagoCharging({
        ...common,
        database: undefined,
        gate: gate(),
        cloudClient: cloudClient([]),
      }),
      createMercadoPagoCharging({
        ...common,
        database,
        gate: undefined,
        cloudClient: cloudClient([]),
      }),
      createMercadoPagoCharging({ ...common, database, gate: gate(), cloudClient: undefined }),
    ]) {
      expect(charging.start).toBeUndefined();
      expect(charging.follow).toBeUndefined();
      expect(charging.abandon).toBeUndefined();
      expect(charging.chargesLeftPending).toBeUndefined();
      expect(charging.followInterrupted).toBeUndefined();
    }
  });

  it("starts a charge on the integrated terminal by asking the cloud for a terminal order with the device token", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const signedInPerson = createSignedInPerson();
    seedChargeRegister(database);
    signedInPerson.set("u1");
    const saleId = await openSaleOfTwoYerbas({ database, signedInPerson });
    const charging = createMercadoPagoCharging({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      cloudClient: cloudClient(requests),
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => "key",
      now: () => NOW,
      ids: { next: () => "point-1" },
    });

    expect(await charging.start?.({ saleId, method: "POINT", amount: 3000 })).toEqual({
      kind: "order_refused",
    });
    expect(
      requests.map(({ url, init }) => [
        url,
        init.method,
        init.headers,
        JSON.parse(String(init.body)),
      ]),
    ).toEqual([
      [
        "https://cloud.example/api/payments/mercado-pago/orders",
        "POST",
        expect.objectContaining({ authorization: "Bearer prefix.secret" }),
        {
          payment_transaction_id: "point-1",
          sale_id: saleId,
          provider: "MERCADOPAGO_POINT",
          amount: 3000,
        },
      ],
    ]);
  });

  it("unlocks the sale once the cloud records as cancelled a terminal payment it never recorded and whose order it could not be asked for", async () => {
    const signedInPerson = createSignedInPerson();
    seedChargeRegister(database);
    signedInPerson.set("u1");
    const saleId = await openSaleOfTwoYerbas({ database, signedInPerson });
    const pointGate = createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => NOW,
    });
    const notFound = cloudClient([]);
    const charging = createMercadoPagoCharging({
      database,
      gate: pointGate,
      cloudClient: {
        ...notFound,
        fetch: async (url: string, init: RequestInit) => {
          if (url.endsWith(`/${POINT_PAYMENT_ID}/cancel`)) {
            return Response.json({
              payment_transaction_id: POINT_PAYMENT_ID,
              state: "CANCELLED",
              needs_review: false,
              provider: "MERCADOPAGO_POINT",
              amount: 3000,
              expires_at: "2026-10-09T12:05:00.000Z",
              cancel_on_terminal: false,
            });
          }
          if (init.method === "POST") {
            throw new TypeError("fetch failed");
          }
          return notFound.fetch(url, init);
        },
      },
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => "key",
      now: () => NOW,
      ids: { next: () => POINT_PAYMENT_ID },
    });

    expect(await charging.start?.({ saleId, method: "POINT", amount: 3000 })).toMatchObject({
      kind: "order_unconfirmed",
      payment_transaction_id: POINT_PAYMENT_ID,
    });
    expect(await charging.follow?.({ paymentTransactionId: POINT_PAYMENT_ID })).toEqual({
      kind: "closed",
    });
    expect(await currentSaleFor({ database, gate: pointGate, now: () => NOW })).toMatchObject({
      charge_refusal: null,
      mercado_pago_charge_in_progress: null,
    });
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
    const charging = createMercadoPagoCharging({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson: signedIn,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      cloudClient: cloudClient(requests, PROVIDER_UNAVAILABLE),
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
        "https://cloud.example/api/payments/mercado-pago/qr-1",
        "GET",
        { authorization: "Bearer prefix.secret" },
      ],
    ]);
  });

  it("reads the state of every pending charge from the cloud with the device token, with nobody signed in", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
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
    const charging = createMercadoPagoCharging({
      database,
      gate: gate(),
      cloudClient: cloudClient(requests, PROVIDER_UNAVAILABLE),
      readDeviceToken: async () => "prefix.secret",
      readOutboxChainKey: async () => "key",
      now: () => NOW,
      ids: { next: () => "id" },
    });

    expect(await charging.followInterrupted?.(charging.chargesLeftPending?.() ?? [])).toEqual({
      followed: [
        { paymentTransactionId: "qr-1", outcome: { kind: "waiting", remaining_seconds: 120 } },
      ],
      failures: [],
    });
    expect(requests.map(({ url, init }) => [url, init.method, init.headers])).toEqual([
      [
        "https://cloud.example/api/payments/mercado-pago/qr-1",
        "GET",
        { authorization: "Bearer prefix.secret" },
      ],
    ]);
  });

  it("asks the cloud to cancel a QR order at its cancel address with the device token", async () => {
    const requests: { url: string; init: RequestInit }[] = [];
    const signedIn = createSignedInPerson();
    database.exec(
      `UPDATE sync_state SET device_id = 'device-1';
       INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
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
    const charging = createMercadoPagoCharging({
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson: signedIn,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      cloudClient: cloudClient(requests, PROVIDER_UNAVAILABLE),
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
        "https://cloud.example/api/payments/mercado-pago/qr-1/cancel",
        "POST",
        { authorization: "Bearer prefix.secret", "content-type": "application/json" },
      ],
    ]);
  });
});
