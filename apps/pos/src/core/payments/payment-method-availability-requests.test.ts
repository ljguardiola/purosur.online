import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LocalDatabase } from "../platform/local-database";
import { LOCAL_MIGRATIONS } from "../platform/local-migrations";
import { migrationClock } from "../platform/test-support/migration-clock";
import { openLocalDatabase } from "../platform/test-support/open-local-database";
import { chargeSaleInCashFor } from "../sales/sale-requests";
import { createSignedInPerson, type SignedInPerson } from "../sessions/signed-in-person";
import type { CloudReachability } from "../sync/cloud-reachability";
import { paymentMethodAvailabilityFor } from "./payment-method-availability-requests";
import {
  CHARGE_CHAIN_KEY,
  CHARGE_NOW,
  chargeRequestDeps,
  FakeMercadoPagoOrders,
  openSaleOfTwoYerbas,
  seedChargeRegister,
} from "./test-support/mercado-pago-charge-requests";

let database: LocalDatabase;
let signedInPerson: SignedInPerson;

function gate() {
  return chargeRequestDeps({ database, signedInPerson }, new FakeMercadoPagoOrders(() => database))
    .gate;
}

function availability(cloud: CloudReachability) {
  return paymentMethodAvailabilityFor({
    database,
    gate: gate(),
    now: () => CHARGE_NOW,
    cloud: () => cloud,
  });
}

beforeEach(() => {
  database = openLocalDatabase(":memory:", LOCAL_MIGRATIONS, migrationClock);
  seedChargeRegister(database);
  signedInPerson = createSignedInPerson();
  signedInPerson.set("u1");
});

afterEach(() => {
  database.close();
});

describe("the payment methods available for the sale being charged", () => {
  it("are none while there is no open sale", async () => {
    expect(await availability("reachable")).toBeNull();
  });

  it("are none while nobody is signed in", async () => {
    await openSaleOfTwoYerbas({ database, signedInPerson });
    signedInPerson.clear();

    expect(await availability("reachable")).toBeNull();
  });

  it("are both available while the cloud is reachable and the sale's pending amount reaches the terminal's minimum", async () => {
    await openSaleOfTwoYerbas({ database, signedInPerson });

    expect(await availability("reachable")).toEqual({
      qr: "available",
      point: "available",
      point_minimum: 1500,
    });
  });

  it.each(["unreachable", "unknown"] as const)(
    "are both offline while the cloud is %s",
    async (cloud) => {
      await openSaleOfTwoYerbas({ database, signedInPerson });

      expect(await availability(cloud)).toEqual({
        qr: "offline",
        point: "offline",
        point_minimum: 1500,
      });
    },
  );

  it("leave the terminal below its minimum once what is pending falls under it, keeping the QR available", async () => {
    const saleId = await openSaleOfTwoYerbas({ database, signedInPerson });
    await chargeSaleInCashFor(
      {
        database,
        gate: gate(),
        readOutboxChainKey: async () => CHARGE_CHAIN_KEY,
        now: () => CHARGE_NOW,
        ids: { next: () => "cash-1" },
      },
      { saleId, tendered: 2000 },
    );

    expect(await availability("reachable")).toEqual({
      qr: "available",
      point: "below_minimum",
      point_minimum: 1500,
    });
  });
});
