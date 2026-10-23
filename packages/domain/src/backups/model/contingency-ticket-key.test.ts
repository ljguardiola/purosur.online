import { describe, expect, it } from "vitest";
import { contingencyTicketSealingKey } from "./contingency-ticket-key.js";

describe("contingencyTicketSealingKey", () => {
  it("is the held key of the highest version, whatever the order it comes in", () => {
    expect(
      contingencyTicketSealingKey([
        { version: 2, key: "second" },
        { version: 3, key: "third" },
        { version: 1, key: "first" },
      ]),
    ).toEqual({ version: 3, key: "third" });
  });

  it("is nothing when the register holds no contingency ticket key yet", () => {
    expect(contingencyTicketSealingKey([])).toBeUndefined();
  });
});
