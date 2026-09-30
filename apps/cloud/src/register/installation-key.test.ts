import { isWellFormedInstallationKey } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { generateInstallationKey } from "./installation-key.js";

describe("generateInstallationKey", () => {
  it("generates a 256-bit key in standard padded base64", () => {
    expect(isWellFormedInstallationKey(generateInstallationKey())).toBe(true);
  });

  it("generates a different key every time", () => {
    const keys = new Set(Array.from({ length: 100 }, generateInstallationKey));

    expect(keys.size).toBe(100);
  });
});
