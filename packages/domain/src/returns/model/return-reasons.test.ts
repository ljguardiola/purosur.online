import { describe, expect, expectTypeOf, it } from "vitest";
import {
  RETURN_DISPOSITIONS,
  RETURN_REASONS,
  type ReturnDisposition,
  type ReturnReason,
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
