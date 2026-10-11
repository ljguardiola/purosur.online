import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createBarcodeReaderLines } from "./barcode-reader-lines.js";

const CARRIAGE_RETURN = 0x0d;

function bytesOf(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

describe("createBarcodeReaderLines", () => {
  it("yields the code of a reading that ends in a carriage return", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf("7790001234567\r"))).toEqual(["7790001234567"]);
  });

  it("yields nothing until the carriage return arrives", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf("77900012"))).toEqual([]);
    expect(lines.feed(bytesOf("34567\r"))).toEqual(["7790001234567"]);
  });

  it("yields every reading that arrives in one chunk, in order", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf("111\r222\r33"))).toEqual(["111", "222"]);
    expect(lines.feed(bytesOf("3\r"))).toEqual(["333"]);
  });

  it("yields the same code each time it is read", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf("7790001234567\r7790001234567\r"))).toEqual([
      "7790001234567",
      "7790001234567",
    ]);
  });

  it("yields nothing for a bare carriage return", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf("\r\r"))).toEqual([]);
  });

  it("keeps a fiscal QR address byte for byte", () => {
    const address = "https://www.afip.gob.ar/fe/qr/?p=eyJ2ZXIiOjEsImZlY2hhIjoiMjAyNi0xMC0xMSIs+/9=";
    const lines = createBarcodeReaderLines();

    expect(lines.feed(bytesOf(`${address}\r`))).toEqual([address]);
  });

  it("reads each byte as one character", () => {
    const lines = createBarcodeReaderLines();

    expect(lines.feed(Uint8Array.of(0xe9, 0x41, CARRIAGE_RETURN))).toEqual(["éA"]);
  });

  it("yields the same codes however the stream is cut into chunks", () => {
    const code = fc.array(
      fc.integer({ min: 0, max: 255 }).filter((byte) => byte !== CARRIAGE_RETURN),
      {
        minLength: 1,
        maxLength: 40,
      },
    );

    fc.assert(
      fc.property(
        fc.array(code, { maxLength: 8 }),
        fc.array(fc.nat({ max: 400 }), { maxLength: 12 }),
        (codes, cuts) => {
          const stream = codes.flatMap((bytes) => [...bytes, CARRIAGE_RETURN]);
          const points = [...new Set(cuts.map((cut) => Math.min(cut, stream.length)))].sort(
            (a, b) => a - b,
          );
          const boundaries = [0, ...points, stream.length];
          const chunks = boundaries
            .slice(0, -1)
            .map((start, index) => Uint8Array.from(stream.slice(start, boundaries[index + 1])));
          const lines = createBarcodeReaderLines();

          const yielded = chunks.flatMap((chunk) => lines.feed(chunk));

          expect(yielded).toEqual(codes.map((bytes) => String.fromCharCode(...bytes)));
        },
      ),
    );
  });
});
