import { describe, expect, it } from "vitest";
import {
  FakeZoneRulesSource,
  fixedOffsetZoneRules,
} from "../../shared/test-support/fake-zone-rules-source.js";
import { listPurchaseChoices } from "./list-purchase-choices.js";
import { FakePurchasingListReader } from "./test-support/fake-purchasing-list-reader.js";

const CLOCK = { now: () => new Date("2026-09-16T15:00:00.000Z") };
function supplier(id: string, name: string, active: boolean) {
  return { id, name, cuit: null, contact: null, note: null, active, version: 1 };
}

describe("listPurchaseChoices", () => {
  it("offers only the suppliers a purchase may be registered from", async () => {
    const andina = supplier("s-1", "Andina", true);
    const reader = new FakePurchasingListReader({
      suppliers: [andina, supplier("s-2", "Cerrada", false)],
    });

    expect((await listPurchaseChoices(reader, CLOCK, new FakeZoneRulesSource())).suppliers).toEqual(
      [andina],
    );
  });

  it("answers the day it is in Argentina as the day today's purchases are dated", async () => {
    const clock = { now: () => new Date("2026-09-17T01:00:00.000Z") };

    expect(
      (
        await listPurchaseChoices(
          new FakePurchasingListReader({}),
          clock,
          new FakeZoneRulesSource(),
        )
      ).today,
    ).toBe("2026-09-16");
  });

  it("names today on the calendar day of the zone rules it is given", async () => {
    const clock = { now: () => new Date("2026-09-16T01:00:00.000Z") };
    const reader = new FakePurchasingListReader({});

    const underArgentina = await listPurchaseChoices(
      reader,
      clock,
      new FakeZoneRulesSource(fixedOffsetZoneRules(-180)),
    );
    const underUtc = await listPurchaseChoices(
      reader,
      clock,
      new FakeZoneRulesSource(fixedOffsetZoneRules(0)),
    );

    expect(underArgentina.today).toBe("2026-09-15");
    expect(underUtc.today).toBe("2026-09-16");
  });
});
