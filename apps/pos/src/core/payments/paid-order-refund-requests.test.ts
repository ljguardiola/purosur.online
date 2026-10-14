import type {
  LatePaymentRefundRequestAnswer,
  LatePaymentRefundRequests,
} from "@purosur/domain/payments/use-cases";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { createActionGate } from "../sessions/action-gate";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import { SqliteSignInStore } from "../sessions/sqlite-sign-in-store";
import { convertPaidOrderIntoRefundFor } from "./paid-order-refund-requests";
import { seedChargeRegister } from "./test-support/mercado-pago-charge-requests";

const NOW = new Date("2026-10-13T12:00:00.000Z");

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

class FakeRefunds implements LatePaymentRefundRequests {
  answer: LatePaymentRefundRequestAnswer = { kind: "opened" };
  readonly asked: string[] = [];

  async openLatePaymentRefund(paymentTransactionId: string) {
    this.asked.push(paymentTransactionId);
    return this.answer;
  }
}

function convert(refunds: FakeRefunds, paymentTransactionId = "order-1") {
  return convertPaidOrderIntoRefundFor(
    {
      database,
      gate: createActionGate({
        store: new SqliteSignInStore(database),
        signedInPerson,
        readPepper: async () => undefined,
        hashPin: async () => "",
        now: () => NOW,
      }),
      refunds,
      now: () => NOW,
    },
    { paymentTransactionId },
  );
}

function resolvedAt(): unknown {
  return database
    .prepare(
      "SELECT resolved_at FROM paid_orders_without_sale WHERE payment_transaction_id = 'order-1'",
    )
    .get();
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
  database.exec(
    `INSERT INTO paid_orders_without_sale (payment_transaction_id, sale_id, method, provider, amount, created_at, recorded_at)
     VALUES ('order-1', 'sale-gone', 'QR', 'MERCADOPAGO_QR', 5000,
             '2026-10-13T10:00:00.000Z', '2026-10-13T11:00:00.000Z')`,
  );
});

afterEach(() => {
  database.close();
});

describe("converting a paid order without a sale into a refund at the register", () => {
  it("asks the cloud for the late payment refund and resolves the paid order", async () => {
    const refunds = new FakeRefunds();

    expect(await convert(refunds)).toEqual({ kind: "converted" });
    expect(refunds.asked).toEqual(["order-1"]);
    expect(resolvedAt()).toEqual({ resolved_at: NOW.toISOString() });
  });

  it("converts again without asking the cloud once converted", async () => {
    const refunds = new FakeRefunds();
    await convert(refunds);

    expect(await convert(refunds)).toEqual({ kind: "already_resolved" });
    expect(refunds.asked).toEqual(["order-1"]);
  });

  it("answers not found for a payment the register never recorded", async () => {
    const refunds = new FakeRefunds();

    expect(await convert(refunds, "order-9")).toEqual({ kind: "not_found" });
    expect(refunds.asked).toEqual([]);
  });

  it.each(["refused", "unreachable"] as const)(
    "leaves the paid order unresolved when the cloud answers %s",
    async (kind) => {
      const refunds = new FakeRefunds();
      refunds.answer = { kind };

      expect(await convert(refunds)).toEqual({ kind });
      expect(resolvedAt()).toEqual({ resolved_at: null });
    },
  );

  it("asks nothing and reads nothing while nobody is signed in", async () => {
    signedInPerson.clear();
    const refunds = new FakeRefunds();

    expect(await convert(refunds)).toEqual({ kind: "not_signed_in" });
    expect(refunds.asked).toEqual([]);
    expect(resolvedAt()).toEqual({ resolved_at: null });
  });

  it("asks nothing for a person who may not sell", async () => {
    database.exec(
      "UPDATE role_permissions SET active = 0 WHERE permission_key = 'sell_and_charge'",
    );
    const refunds = new FakeRefunds();

    expect(await convert(refunds)).toEqual({ kind: "not_permitted" });
    expect(refunds.asked).toEqual([]);
    expect(resolvedAt()).toEqual({ resolved_at: null });
  });
});
