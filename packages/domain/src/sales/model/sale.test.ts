import { describe, expect, it } from "vitest";
import { SALE_STATES_AFTER_COMPLETION } from "./sale.js";

describe("the states of a sale after its completion", () => {
  it("are completed and voided, never open nor cancelled", () => {
    expect(SALE_STATES_AFTER_COMPLETION).toEqual(["COMPLETED", "VOIDED"]);
  });
});
