import type { ClockCorrectionAlertState } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type ClockCorrectionBody, clockCorrectionListSchema } from "./clock-correction.js";

const correction = {
  id: "5b9e2f4a-7c1d-4e83-a6f0-3d8c1b7e9a42",
  corrected_at: "2026-10-05T12:00:00.000Z",
  register_id: "3f0d1a52-0f7e-4a53-9f4c-2a7d2f1c9b10",
  register_name: "Caja 1",
  point_of_sale_number: 4,
  document_type: "factura_c",
  actor_id: "c7b3e5d2-18a4-4f90-b6d1-2e9f0a8c3d03",
  actor_first_name: "Ada",
  previous_reading: "2026-10-07T12:00:00.000Z",
  corrected_reading: "2026-10-05T12:00:00.000Z",
  alert_state: "open",
};

describe("clockCorrectionListSchema", () => {
  it("reads the corrections of a branch's registers, open or closed", () => {
    const list = [correction, { ...correction, alert_state: "closed" }];

    expect(clockCorrectionListSchema.parse(list)).toEqual(list);
  });

  it("reads an empty list", () => {
    expect(clockCorrectionListSchema.parse([])).toEqual([]);
  });

  it.each([
    ["an alert state it does not know", { alert_state: "snoozed" }],
    ["a document type it does not know", { document_type: "factura_z" }],
    ["a point of sale outside the tax authority's range", { point_of_sale_number: 0 }],
    ["a reading that is not an instant", { previous_reading: "yesterday" }],
    ["a correction time that is not an instant", { corrected_at: "2026-10-05" }],
  ])("refuses a correction with %s", (_name, override) => {
    expect(clockCorrectionListSchema.safeParse([{ ...correction, ...override }]).success).toBe(
      false,
    );
  });

  it("refuses a correction missing a field", () => {
    const { actor_first_name: _actor, ...withoutActor } = correction;

    expect(clockCorrectionListSchema.safeParse([withoutActor]).success).toBe(false);
  });

  it("carries the alert's state as the domain names it", () => {
    expectTypeOf<ClockCorrectionBody["alert_state"]>().toEqualTypeOf<ClockCorrectionAlertState>();
  });
});
