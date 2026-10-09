import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RECEIPT_LOGO } from "./receipt-logo";

const GENERATOR = fileURLToPath(
  new URL("../../../scripts/generate-receipt-logo.ts", import.meta.url),
);
const COMMITTED = fileURLToPath(new URL("./receipt-logo.ts", import.meta.url));

describe("the receipt's logo bitmap", () => {
  it("is what the generator rasterizes from the brand's logo today", () => {
    const generated = execFileSync(process.execPath, [GENERATOR], { encoding: "utf8" });

    expect(generated).toBe(readFileSync(COMMITTED, "utf8"));
  });

  it("is as wide as a whole number of bytes that fits the printer's 384 dots", () => {
    expect(RECEIPT_LOGO.widthDots % 8).toBe(0);
    expect(RECEIPT_LOGO.widthDots).toBeLessThanOrEqual(384);
  });

  it("holds one row of whole bytes per dot of height", () => {
    expect(RECEIPT_LOGO.rows).toHaveLength(RECEIPT_LOGO.heightDots);
    for (const row of RECEIPT_LOGO.rows) {
      expect(Buffer.from(row, "base64")).toHaveLength(RECEIPT_LOGO.widthDots / 8);
    }
  });

  it("has dots to print", () => {
    const printed = RECEIPT_LOGO.rows.some((row) =>
      Buffer.from(row, "base64").some((byte) => byte !== 0),
    );

    expect(printed).toBe(true);
  });
});
