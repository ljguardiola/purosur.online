import { describe, expect, it } from "vitest";
import { suggestOpeningFloat } from "./suggest-opening-float.js";
import { FakeRegisterCloses } from "./test-support/fake-register-closes.js";

const IDENTITY = { registerId: "register-1", deviceId: "device-1" };
const CLOSED_AT = new Date("2026-11-04T23:14:00.000Z");

describe("suggestOpeningFloat", () => {
  it("suggests the cash counted at the previous close of the register, with when it closed", () => {
    const closes = new FakeRegisterCloses({
      identity: IDENTITY,
      closes: [{ registerId: "register-1", closedAt: CLOSED_AT, countedCash: 14_400_000 }],
    });

    expect(suggestOpeningFloat({ closes })).toEqual({
      kind: "previous_close",
      closedAt: CLOSED_AT,
      countedCash: 14_400_000,
    });
  });

  it("suggests nothing when the register was never closed", () => {
    const closes = new FakeRegisterCloses({ identity: IDENTITY, closes: [] });

    expect(suggestOpeningFloat({ closes })).toEqual({ kind: "none" });
  });

  it("suggests nothing when the register has no identity yet", () => {
    const closes = new FakeRegisterCloses({
      identity: undefined,
      closes: [{ registerId: "register-1", closedAt: CLOSED_AT, countedCash: 14_400_000 }],
    });

    expect(suggestOpeningFloat({ closes })).toEqual({ kind: "none" });
  });

  it("ignores the closes of another register", () => {
    const closes = new FakeRegisterCloses({
      identity: IDENTITY,
      closes: [
        {
          registerId: "register-2",
          closedAt: new Date("2026-11-05T23:00:00.000Z"),
          countedCash: 5_000_000,
        },
      ],
    });

    expect(suggestOpeningFloat({ closes })).toEqual({ kind: "none" });
  });

  it("takes the register's own close even when another register closed later", () => {
    const closes = new FakeRegisterCloses({
      identity: IDENTITY,
      closes: [
        {
          registerId: "register-2",
          closedAt: new Date("2026-11-05T23:00:00.000Z"),
          countedCash: 5_000_000,
        },
        { registerId: "register-1", closedAt: CLOSED_AT, countedCash: 14_400_000 },
      ],
    });

    expect(suggestOpeningFloat({ closes })).toEqual({
      kind: "previous_close",
      closedAt: CLOSED_AT,
      countedCash: 14_400_000,
    });
  });
});
