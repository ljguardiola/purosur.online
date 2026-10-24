import { describe, expect, it } from "vitest";
import { REPLENISHMENT_FAILURE_KINDS } from "./replenishment-failure-kind.js";

describe("REPLENISHMENT_FAILURE_KINDS", () => {
  it("lists the ways a restored register's replenishment can never complete: the cloud refused it or an event could not be read", () => {
    expect(REPLENISHMENT_FAILURE_KINDS).toEqual(["refused", "unreadable_event"]);
  });
});
