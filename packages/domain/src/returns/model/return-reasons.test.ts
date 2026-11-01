import { describe, expect, expectTypeOf, it } from "vitest";
import {
  offeredResolutions,
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  RETURN_RESOLUTIONS,
  type ReturnDisposition,
  type ReturnReason,
  type ReturnResolution,
  TICKET_SOURCES,
  type TicketSource,
} from "./return-reasons.js";

describe("RETURN_REASONS", () => {
  it("lists why a customer brings an item back: a change of mind first, then a defect", () => {
    expect(RETURN_REASONS).toEqual(["change_of_mind", "defective"]);
    expectTypeOf<(typeof RETURN_REASONS)[number]>().toEqualTypeOf<ReturnReason>();
  });
});

describe("RETURN_DISPOSITIONS", () => {
  it("lists what happens to a returned item: back to the shelf or thrown away", () => {
    expect(RETURN_DISPOSITIONS).toEqual(["restock", "discard"]);
    expectTypeOf<(typeof RETURN_DISPOSITIONS)[number]>().toEqualTypeOf<ReturnDisposition>();
  });
});

describe("TICKET_SOURCES", () => {
  it("lists how the ticket of a return was read: scanned or typed in", () => {
    expect(TICKET_SOURCES).toEqual(["QR", "TYPED"]);
    expectTypeOf<(typeof TICKET_SOURCES)[number]>().toEqualTypeOf<TicketSource>();
  });
});

describe("RETURN_RESOLUTIONS", () => {
  it("lists what is done about a returned line: refund it or exchange it", () => {
    expect(RETURN_RESOLUTIONS).toEqual(["refund", "exchange"]);
    expectTypeOf<(typeof RETURN_RESOLUTIONS)[number]>().toEqualTypeOf<ReturnResolution>();
  });
});

describe("offeredResolutions", () => {
  it("offers only a refund for a change of mind", () => {
    expect(offeredResolutions("change_of_mind")).toEqual(["refund"]);
  });

  it("offers a refund or an exchange for a defect", () => {
    expect(offeredResolutions("defective")).toEqual(["refund", "exchange"]);
  });
});
