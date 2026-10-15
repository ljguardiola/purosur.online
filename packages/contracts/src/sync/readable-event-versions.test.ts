import { describe, expect, it } from "vitest";
import { readableEventVersionsSchema } from "./readable-event-versions.js";

describe("the readable event versions answer", () => {
  it("holds event versions of the form event_type@schema_version", () => {
    const body = { event_versions: ["sale_completed@1", "cash_session_opened@12"] };

    expect(readableEventVersionsSchema.parse(body)).toEqual(body);
  });

  it("accepts no versions", () => {
    expect(readableEventVersionsSchema.parse({ event_versions: [] })).toEqual({
      event_versions: [],
    });
  });

  it.each([
    "sale_completed",
    "sale_completed@",
    "@1",
    "sale_completed@0",
    "sale_completed@01",
    "sale_completed@1.5",
    "sale_completed@-1",
    "sale_completed@1 ",
    " sale_completed@1",
    "sale completed@1",
    "Sale_completed@1",
    "sale_completed@1@2",
  ])("refuses %j, which is not an event version", (version) => {
    expect(readableEventVersionsSchema.safeParse({ event_versions: [version] }).success).toBe(
      false,
    );
  });

  it("carries nothing else", () => {
    const parsed = readableEventVersionsSchema.parse({
      event_versions: ["sale_completed@1"],
      hostname: "cloud-1",
    });

    expect(parsed).toEqual({ event_versions: ["sale_completed@1"] });
  });
});
