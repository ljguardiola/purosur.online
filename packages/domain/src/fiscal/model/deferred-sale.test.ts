import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DEFERRED_SALE_QR_PREFIX,
  deferredSaleDocumentBlock,
  deferredSaleQrText,
  formatShortCode,
  parseDeferredSaleQrText,
  randomShortCode,
  SHORT_CODE_ALPHABET,
  SHORT_CODE_LENGTH,
} from "./deferred-sale.js";

const shortCodes = fc.array(fc.constantFrom(...SHORT_CODE_ALPHABET), {
  minLength: SHORT_CODE_LENGTH,
  maxLength: SHORT_CODE_LENGTH,
});
const ids = fc.uuid();

describe("short code alphabet", () => {
  it("has 32 distinct characters, none of which can be mistaken for another", () => {
    expect(SHORT_CODE_ALPHABET).toBe("23456789ABCDEFGHJKLMNPQRSTUVWXYZ");
    expect(new Set(SHORT_CODE_ALPHABET).size).toBe(32);
    for (const mistakable of "01IO") {
      expect(SHORT_CODE_ALPHABET).not.toContain(mistakable);
    }
  });

  it("is made of 8 characters", () => {
    expect(SHORT_CODE_LENGTH).toBe(8);
  });
});

describe("randomShortCode", () => {
  it("draws every character from the alphabet by asking for an index below its size", () => {
    const bounds: number[] = [];
    const code = randomShortCode((bound) => {
      bounds.push(bound);
      return bounds.length - 1;
    });

    expect(bounds).toEqual(Array(SHORT_CODE_LENGTH).fill(SHORT_CODE_ALPHABET.length));
    expect(code).toBe("23456789");
  });

  it("reaches the last character of the alphabet", () => {
    expect(randomShortCode((bound) => bound - 1)).toBe("Z".repeat(SHORT_CODE_LENGTH));
  });

  it("builds a code of 8 alphabet characters from any indexes", () => {
    fc.assert(
      fc.property(fc.infiniteStream(fc.nat(SHORT_CODE_ALPHABET.length - 1)), (indexes) => {
        const next = indexes[Symbol.iterator]();
        const code = randomShortCode(() => next.next().value);

        expect(code).toMatch(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      }),
    );
  });
});

describe("formatShortCode", () => {
  it("groups the code in two blocks of four joined by a hyphen", () => {
    expect(formatShortCode("7KQ4M2P9")).toBe("7KQ4-M2P9");
  });
});

describe("deferred sale QR text", () => {
  it("carries the record's id and its short code", () => {
    expect(deferredSaleQrText({ id: "0198-abc", shortCode: "7KQ4M2P9" })).toBe(
      "purosur-deferred-sale:0198-abc:7KQ4M2P9",
    );
    expect(DEFERRED_SALE_QR_PREFIX).toBe("purosur-deferred-sale:");
  });

  it("is read back into the id and the short code it was made from", () => {
    fc.assert(
      fc.property(ids, shortCodes, (id, characters) => {
        const shortCode = characters.join("");

        expect(parseDeferredSaleQrText(deferredSaleQrText({ id, shortCode }))).toEqual({
          id,
          shortCode,
        });
      }),
    );
  });

  it.each([
    ["an invoice QR", "https://www.arca.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9"],
    ["an empty text", ""],
    ["another prefix", "other:0198-abc:7KQ4M2P9"],
    ["no id", "purosur-deferred-sale::7KQ4M2P9"],
    ["no short code", "purosur-deferred-sale:0198-abc:"],
    ["a short code that is too short", "purosur-deferred-sale:0198-abc:7KQ4M2P"],
    ["a short code that is too long", "purosur-deferred-sale:0198-abc:7KQ4M2P9A"],
    [
      "a short code with a character outside the alphabet",
      "purosur-deferred-sale:0198-abc:7KQ4M2P0",
    ],
    ["a lowercase short code", "purosur-deferred-sale:0198-abc:7kq4m2p9"],
    ["an extra part", "purosur-deferred-sale:0198-abc:7KQ4M2P9:more"],
    ["text before the prefix", " purosur-deferred-sale:0198-abc:7KQ4M2P9"],
    ["text after the short code", "purosur-deferred-sale:0198-abc:7KQ4M2P9\n"],
  ])("is not recognised in %s", (_name, text) => {
    expect(parseDeferredSaleQrText(text)).toBeUndefined();
  });
});

describe("deferredSaleDocumentBlock", () => {
  it("is the X document carrying the formatted short code and the QR of the record", () => {
    expect(deferredSaleDocumentBlock({ id: "0198-abc", shortCode: "7KQ4M2P9" })).toEqual({
      invoiceClass: "X",
      shortCode: "7KQ4-M2P9",
      qrText: "purosur-deferred-sale:0198-abc:7KQ4M2P9",
    });
  });
});
