import { describe, expect, it } from "vitest";
import { WEIGHT_SOURCES } from "./weight-source.js";

describe("WEIGHT_SOURCES", () => {
  it("names the scale and a typed entry", () => {
    expect([...WEIGHT_SOURCES]).toEqual(["SCALE", "MANUAL"]);
  });
});
