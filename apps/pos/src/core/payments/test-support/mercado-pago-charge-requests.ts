import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "@purosur/domain/fiscal/test-support";
import type {
  MercadoPagoChargeOrderAnswer,
  MercadoPagoChargeOrderCancellation,
  MercadoPagoChargeOrderReading,
  MercadoPagoChargeOrders,
} from "@purosur/domain/payments/use-cases";
import type { LocalDatabase } from "../../platform/local-database";
import { scanProductFor } from "../../sales/sale-requests";
import { createActionGate } from "../../sessions/action-gate";
import type { SignedInPerson } from "../../sessions/signed-in-person";
import { SqliteSignInStore } from "../../sessions/sqlite-sign-in-store";
import type { MercadoPagoChargeRequestDeps } from "../mercado-pago-charge-requests";

export const CHARGE_NOW = new Date("2026-10-09T12:00:00.000Z");
export const CHARGE_CHAIN_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

export interface ChargeRegister {
  database: LocalDatabase;
  signedInPerson: SignedInPerson;
}

export class FakeMercadoPagoOrders implements MercadoPagoChargeOrders {
  readonly requested: {
    paymentTransactionId: string;
    saleId: string;
    method: "QR" | "POINT";
    amount: number;
  }[] = [];
  answer: MercadoPagoChargeOrderAnswer = {
    kind: "created",
    expiresAt: new Date("2026-10-09T12:03:00.000Z"),
  };
  reading: MercadoPagoChargeOrderReading = { kind: "read", state: "PENDING" };
  cancellation: MercadoPagoChargeOrderCancellation = { kind: "answered", state: "CANCELLED" };
  cancelled: string[] = [];
  pendingRowsWhenAsked: unknown[] = [];
  private readonly database: () => LocalDatabase;

  constructor(database: () => LocalDatabase) {
    this.database = database;
  }

  async requestOrder(order: {
    paymentTransactionId: string;
    saleId: string;
    method: "QR" | "POINT";
    amount: number;
  }) {
    this.pendingRowsWhenAsked = this.database()
      .prepare("SELECT id, state FROM payment_transactions WHERE method IN ('QR', 'POINT')")
      .all();
    this.requested.push(order);
    return this.answer;
  }

  async readOrder() {
    return this.reading;
  }

  async cancelOrder(paymentTransactionId: string) {
    this.cancelled.push(paymentTransactionId);
    return this.cancellation;
  }
}

export function chargeRequestDeps(
  { database, signedInPerson }: ChargeRegister,
  orders: MercadoPagoChargeOrders,
  overrides: Partial<MercadoPagoChargeRequestDeps> = {},
): MercadoPagoChargeRequestDeps {
  let count = 0;
  return {
    database,
    gate: createActionGate({
      store: new SqliteSignInStore(database),
      signedInPerson,
      readPepper: async () => undefined,
      hashPin: async () => "",
      now: () => CHARGE_NOW,
    }),
    orders,
    readOutboxChainKey: async () => CHARGE_CHAIN_KEY,
    now: () => CHARGE_NOW,
    ids: {
      next: () => {
        count += 1;
        return `qr-${count}`;
      },
    },
    ...overrides,
  };
}

export function seedChargeRegister(database: LocalDatabase): void {
  database.exec(
    `INSERT INTO roles (id, name, is_administrator, version) VALUES ('cashier', 'Cajera', 0, 1);
     INSERT INTO role_permissions (role_id, permission_key, active) VALUES ('cashier', 'sell_and_charge', 1);
     INSERT INTO users (id, first_name, role_id, salt, active, version) VALUES ('u1', 'Ada', 'cashier', 's', 1, 1);
     INSERT INTO own_register (id, name, version) VALUES ('register-1', 'Caja 1', 1);
     UPDATE sync_state SET device_id = 'device-1';
     INSERT INTO buyer_identification_thresholds (id, amount, valid_from, revision)
       VALUES ('threshold-1', 100000000, '2026-01-01', 0);
     INSERT INTO cash_sessions (id, register_id, device_id, opened_by, opened_at, opening_float, state)
       VALUES ('session-1', 'register-1', 'device-1', 'u1', '2026-10-09T08:00:00.000Z', 0, 'OPEN');
     INSERT INTO products (id, name, category_id, sale_unit, active, version)
       VALUES ('p1', 'Yerba', 'c', 'UNIT', 1, 1);
     INSERT INTO product_barcodes (product_id, position, code, active) VALUES ('p1', 1, '111', 1);
     INSERT INTO prices (id, product_id, price_list_id, unit_price, valid_from, version)
       VALUES ('price-1', 'p1', 'list-1', 1500, '2026-09-01T00:00:00.000Z', 1);
     INSERT INTO buyer_tax_status_sets (params_version, set_id, options)
       VALUES (1, 'set-1', '[{"code":5,"description":"Consumidor Final","invoice_class":"A/M/C"}]');`,
  );
  database
    .prepare(
      `INSERT INTO issuer_identification_versions (
         version, legal_name, gross_income_registration, activity_start_date, authorized_cuit, tax_status
       ) VALUES (1, ?, ?, '2020-01-15', ?, 'Condicion de prueba')`,
    )
    .run(FICTIONAL_LEGAL_NAME, FICTIONAL_GROSS_INCOME_REGISTRATION, FICTIONAL_CUIT);
}

export async function openSaleOfTwoYerbas(register: ChargeRegister): Promise<string> {
  const saleDeps = {
    database: register.database,
    gate: chargeRequestDeps(register, new FakeMercadoPagoOrders(() => register.database)).gate,
    now: () => CHARGE_NOW,
    ids: {
      next: (() => {
        let count = 0;
        return () => {
          count += 1;
          return `sale-id-${count}`;
        };
      })(),
    },
  };
  await scanProductFor(saleDeps, "111");
  const outcome = await scanProductFor(saleDeps, "111");
  if (outcome.kind !== "added") {
    throw new Error("test setup: the product was not added");
  }
  return outcome.sale.id;
}
