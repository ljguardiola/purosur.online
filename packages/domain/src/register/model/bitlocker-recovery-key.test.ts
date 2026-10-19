import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isBitlockerKeyIdentifier, isBitlockerRecoveryKey } from "./bitlocker-recovery-key.js";

const BLOCK_LIMIT = 720896;

const validBlock = fc
  .integer({ min: 0, max: BLOCK_LIMIT / 11 - 1 })
  .map((multiple) => String(multiple * 11).padStart(6, "0"));
const validKey = fc.array(validBlock, { minLength: 8, maxLength: 8 }).map((b) => b.join("-"));

describe("isBitlockerRecoveryKey", () => {
  it("accepts eight hyphenated blocks of six digits that Windows could have generated", () => {
    fc.assert(fc.property(validKey, (key) => isBitlockerRecoveryKey(key)));
    expect(isBitlockerRecoveryKey("000000-000011-720885-000022-123651-654401-000033-100100")).toBe(
      true,
    );
  });

  it("refuses a block that is not a multiple of 11", () => {
    fc.assert(
      fc.property(
        validKey,
        fc.integer({ min: 0, max: 7 }),
        fc.integer({ min: 1, max: 10 }),
        (key, index, offset) => {
          const blocks = key.split("-");
          blocks[index] = String(Number(blocks[index]) + offset).padStart(6, "0");
          return !isBitlockerRecoveryKey(blocks.join("-"));
        },
      ),
    );
  });

  it("refuses a block of 720896 or more", () => {
    const aboveLimit = String(65536 * 11).padStart(6, "0");
    expect(aboveLimit).toBe("720896");
    expect(isBitlockerRecoveryKey(`${aboveLimit}-${Array(7).fill("000000").join("-")}`)).toBe(
      false,
    );
    expect(isBitlockerRecoveryKey(`${Array(7).fill("000000").join("-")}-999999`)).toBe(false);
  });

  it("refuses a key without exactly eight blocks", () => {
    const blocks = Array<string>(9).fill("000011");
    expect(isBitlockerRecoveryKey(blocks.slice(0, 7).join("-"))).toBe(false);
    expect(isBitlockerRecoveryKey(blocks.join("-"))).toBe(false);
    expect(isBitlockerRecoveryKey("")).toBe(false);
  });

  it("refuses anything but the canonical hyphenated form", () => {
    const blocks = Array<string>(8).fill("000011");
    expect(isBitlockerRecoveryKey(blocks.join(""))).toBe(false);
    expect(isBitlockerRecoveryKey(blocks.join(" "))).toBe(false);
    expect(isBitlockerRecoveryKey(` ${blocks.join("-")}`)).toBe(false);
    expect(isBitlockerRecoveryKey(`${blocks.join("-")}\n`)).toBe(false);
    expect(isBitlockerRecoveryKey(blocks.join("-").replace("0000", "00a0"))).toBe(false);
    expect(isBitlockerRecoveryKey(blocks.map((b) => b.slice(1)).join("-"))).toBe(false);
  });
});

describe("isBitlockerKeyIdentifier", () => {
  it("accepts exactly eight uppercase hexadecimal digits", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: fc.constantFrom(..."0123456789ABCDEF"), minLength: 8, maxLength: 8 }),
        (id) => isBitlockerKeyIdentifier(id),
      ),
    );
  });

  it("refuses other lengths, lowercase digits and non hexadecimal characters", () => {
    expect(isBitlockerKeyIdentifier("8F3A2C1")).toBe(false);
    expect(isBitlockerKeyIdentifier("8F3A2C1D0")).toBe(false);
    expect(isBitlockerKeyIdentifier("8f3a2c1d")).toBe(false);
    expect(isBitlockerKeyIdentifier("8F3A2C1G")).toBe(false);
    expect(isBitlockerKeyIdentifier(" 8F3A2C1D")).toBe(false);
    expect(isBitlockerKeyIdentifier("8F3A2C1D\n")).toBe(false);
    expect(isBitlockerKeyIdentifier("")).toBe(false);
  });
});
