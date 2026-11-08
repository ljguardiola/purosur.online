import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import type { SettlementMovement } from "../model/mercado-pago-settlement.js";
import type { RecordedMercadoPagoCharge } from "./mercado-pago-charge-costs-reader.js";
import { readMercadoPagoChargeCosts } from "./read-mercado-pago-charge-costs.js";
import { FakeMercadoPagoChargeCostsReader } from "./test-support/fake-mercado-pago-charge-costs-reader.js";

const NOW = new Date("2026-10-06T15:00:00.000Z");
const clock = { now: () => NOW };
const noRange = { from: undefined, to: undefined };

const MOVEMENT: SettlementMovement = {
  sourceId: "1000000001",
  transactionType: "SETTLEMENT",
  transactionDate: new Date("2026-10-01T13:00:00Z"),
  grossAmount: 10_000,
  feeAmount: -340,
  financingFeeAmount: 0,
  taxesAmount: -120,
  netAmount: 9540,
  moneyReleaseDate: new Date("2026-10-15T13:00:00Z"),
};

const CHARGE: RecordedMercadoPagoCharge = {
  paymentTransactionId: "tx-1",
  saleId: "sale-1",
  method: "POINT",
  registerId: "register-1",
  registerName: "Caja 1",
  amount: 10_000,
  chargedAt: new Date("2026-10-01T13:00:00Z"),
  movements: [MOVEMENT],
};

describe("readMercadoPagoChargeCosts", () => {
  it("reads the charges of the branch and the other charges for the asked range and summarizes them", async () => {
    const reader = new FakeMercadoPagoChargeCostsReader(
      [CHARGE],
      [{ sourceId: "2000000001", movements: [{ ...MOVEMENT, sourceId: "2000000001" }] }],
    );

    const report = await readMercadoPagoChargeCosts(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: { from: "2026-10-01", to: "2026-10-06" } },
    );

    expect(report.range).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(report.charges.map((charge) => charge.paymentTransactionId)).toEqual(["tx-1"]);
    expect(report.totals).toMatchObject({ chargesCount: 2, grossAmount: 20_000 });
    expect(reader.chargeReads).toEqual([
      { locationId: "branch-1", period: { from: "2026-10-01", to: "2026-10-06" } },
    ]);
    expect(reader.otherChargeReads).toEqual([{ period: { from: "2026-10-01", to: "2026-10-06" } }]);
  });

  it("reads the current day of the clock when no range is asked", async () => {
    const reader = new FakeMercadoPagoChargeCostsReader();

    const report = await readMercadoPagoChargeCosts(
      { zoneRules: new FakeZoneRulesSource(), reader, clock },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(reader.chargeReads[0]?.period).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("resolves the current day in Argentina, not in UTC", async () => {
    const report = await readMercadoPagoChargeCosts(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakeMercadoPagoChargeCostsReader(),
        clock: { now: () => new Date("2026-10-07T01:30:00.000Z") },
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.range).toEqual({ from: "2026-10-06", to: "2026-10-06" });
  });

  it("days the charges on the calendar of the zone rules it is given", async () => {
    const report = await readMercadoPagoChargeCosts(
      {
        zoneRules: new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
        reader: new FakeMercadoPagoChargeCostsReader([
          { ...CHARGE, chargedAt: new Date("2026-10-02T01:30:00Z") },
        ]),
        clock,
      },
      { locationId: "branch-1", asked: { from: "2026-10-01", to: "2026-10-06" } },
    );

    expect(report.days.map((day) => day.day)).toEqual(["2026-10-02"]);
  });

  it("leaves out a charge outside the system the reader handed from outside the range", async () => {
    const report = await readMercadoPagoChargeCosts(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakeMercadoPagoChargeCostsReader(
          [],
          [
            {
              sourceId: "2000000001",
              movements: [
                {
                  ...MOVEMENT,
                  sourceId: "2000000001",
                  transactionDate: new Date("2026-09-20T13:00:00Z"),
                },
              ],
            },
          ],
        ),
        clock,
      },
      { locationId: "branch-1", asked: { from: "2026-10-01", to: "2026-10-06" } },
    );

    expect(report.totals.chargesCount).toBe(0);
  });

  it("reports no charges and zero totals for a range without charges", async () => {
    const report = await readMercadoPagoChargeCosts(
      {
        zoneRules: new FakeZoneRulesSource(),
        reader: new FakeMercadoPagoChargeCostsReader(),
        clock,
      },
      { locationId: "branch-1", asked: noRange },
    );

    expect(report.charges).toEqual([]);
    expect(report.totals.chargesCount).toBe(0);
  });
});
