import { describe, expect, it } from "vitest";
import {
  centered,
  concatenated,
  EscPosWriter,
  labeledValue,
  RULE,
  row,
  SMALL_COLUMNS,
  wrapped,
} from "./escpos-writer";
import { encodePc850 } from "./pc850";

const ESC = 0x1b;
const GS = 0x1d;
const LINE_FEED = 0x0a;

function written(write: (out: EscPosWriter) => void): number[] {
  const out = new EscPosWriter();
  write(out);
  return Array.from(out.bytes());
}

function text(line: string): number[] {
  return Array.from(encodePc850(line));
}

describe("writing ESC/POS printer commands", () => {
  it("resets the printer and selects the PC850 code table", () => {
    expect(written((out) => out.initialize())).toEqual([ESC, 0x40, ESC, 0x74, 2]);
  });

  it("writes each line in PC850 followed by a line feed", () => {
    expect(written((out) => out.lines(["Café", "Ñandú"]))).toEqual([
      ...text("Café"),
      LINE_FEED,
      ...text("Ñandú"),
      LINE_FEED,
    ]);
  });

  it("writes each bold line between emphasis on and off", () => {
    expect(written((out) => out.bold(["TOTAL", "Gracias"]))).toEqual([
      ...[ESC, 0x45, 1, ...text("TOTAL"), ESC, 0x45, 0, LINE_FEED],
      ...[ESC, 0x45, 1, ...text("Gracias"), ESC, 0x45, 0, LINE_FEED],
    ]);
  });

  it("writes each small line in the printer's small font", () => {
    expect(written((out) => out.small(["Cód. 011", "CUIT"]))).toEqual([
      ...[ESC, 0x4d, 1, ...text("Cód. 011"), ESC, 0x4d, 0, LINE_FEED],
      ...[ESC, 0x4d, 1, ...text("CUIT"), ESC, 0x4d, 0, LINE_FEED],
    ]);
  });

  it("feeds the paper by a number of dots", () => {
    expect(written((out) => out.feed(24))).toEqual([ESC, 0x4a, 24]);
  });

  it("prints a raster image with its width in bytes and its height in dots", () => {
    const rows = Uint8Array.of(0xff, 0x00, 0x81, 0x7e);
    expect(written((out) => out.rasterImage({ widthDots: 2056, heightDots: 300, rows }))).toEqual([
      GS,
      0x76,
      0x30,
      0,
      0x01,
      0x01,
      0x2c,
      0x01,
      0xff,
      0x00,
      0x81,
      0x7e,
    ]);
  });

  it("feeds five lines and cuts the paper partially at the end", () => {
    expect(written((out) => out.cut())).toEqual([ESC, 0x64, 5, GS, 0x56, 1]);
  });

  it("writes everything in the order it was asked for", () => {
    expect(
      written((out) => {
        out.feed(8);
        out.lines(["a"]);
        out.feed(16);
      }),
    ).toEqual([ESC, 0x4a, 8, ...text("a"), LINE_FEED, ESC, 0x4a, 16]);
  });
});

describe("writing a QR code", () => {
  function qrCommands(data: string, moduleDots: number, correction: number): number[] {
    const stored = encodePc850(data).length + 3;
    return [
      ...[ESC, 0x61, 1],
      ...[GS, 0x28, 0x6b, 4, 0, 0x31, 0x41, 0x32, 0],
      ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x43, moduleDots],
      ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x45, correction],
      ...[GS, 0x28, 0x6b, stored & 0xff, stored >> 8, 0x31, 0x50, 0x30],
      ...text(data),
      ...[GS, 0x28, 0x6b, 3, 0, 0x31, 0x51, 0x30],
      ...[ESC, 0x61, 0],
    ];
  }

  it("prints a QR code of a fixed module size at correction level M, centered", () => {
    expect(written((out) => out.qr("respaldo", { correction: "M", moduleDots: 4 }))).toEqual(
      qrCommands("respaldo", 4, 0x31),
    );
  });

  it.each([
    ["the smallest version", 17, 12],
    ["the version that holds a hundred bytes", 100, 7],
    ["the largest version", 2953, 1],
  ])(
    "fits a QR code at correction level L to a side, sizing the module for %s",
    (_, length, moduleDots) => {
      const data = "x".repeat(length);
      expect(written((out) => out.qr(data, { correction: "L", sideDots: 244 }))).toEqual(
        qrCommands(data, moduleDots, 0x30),
      );
    },
  );

  it("sizes the module for the largest version when the data exceeds every version", () => {
    const data = "x".repeat(3000);
    expect(written((out) => out.qr(data, { correction: "L", sideDots: 244 }))).toEqual(
      qrCommands(data, 1, 0x30),
    );
  });

  it("never makes a fitted QR code's module larger than sixteen dots", () => {
    expect(written((out) => out.qr("x", { correction: "L", sideDots: 1000 }))).toEqual(
      qrCommands("x", 16, 0x30),
    );
  });

  it("stores data longer than 252 bytes with its length's high byte", () => {
    const data = "x".repeat(300);
    expect(
      written((out) => out.qr(data, { correction: "M", moduleDots: 4 })).slice(28, 36),
    ).toEqual([GS, 0x28, 0x6b, 0x2f, 0x01, 0x31, 0x50, 0x30]);
  });
});

describe("laying out lines of the paper's width", () => {
  it("draws the rule across the forty-eight columns", () => {
    expect(RULE).toBe("─".repeat(48));
  });

  it("wraps text between words without passing the width", () => {
    expect(wrapped("Yerba mate suave de 500 g", 12)).toEqual(["Yerba mate", "suave de 500", "g"]);
  });

  it("cuts a word longer than the width", () => {
    expect(wrapped("a Supercalifragilístico b", 8)).toEqual([
      "a",
      "Supercal",
      "ifragilí",
      "stico b",
    ]);
  });

  it("centers text in the forty-eight columns", () => {
    expect(centered("Gracias por tu compra")).toEqual([`${" ".repeat(13)}Gracias por tu compra`]);
  });

  it("centers each wrapped line in the width it is given", () => {
    expect(centered("uno dos tres", 8)).toEqual(["uno dos", "  tres"]);
  });

  it("puts a label and its value at both ends of one line", () => {
    expect(row("Vuelto", "$ 500,00")).toEqual([`Vuelto${" ".repeat(34)}$ 500,00`]);
  });

  it("wraps a long label beside its value", () => {
    expect(row("uno dos tres", "1,00", "", 12)).toEqual(["uno dos", "tres    1,00"]);
  });

  it("indents every line of the label", () => {
    expect(row("uno dos tres", "1,00", "  ", 14)).toEqual(["  uno dos", "  tres    1,00"]);
  });

  it("puts a value too wide to share the line on its own lines, aligned right", () => {
    expect(row("Sucursal", "Avenida Siempre Viva 742", "", 16)).toEqual([
      "Sucursal",
      " Avenida Siempre",
      "        Viva 742",
    ]);
  });

  it("puts a label and a value that fit together on one line", () => {
    expect(labeledValue("Respalda", "Factura C 00003-00001234")).toEqual([
      `Respalda${" ".repeat(16)}Factura C 00003-00001234`,
    ]);
  });

  it("puts a label and a value that do not fit together on one line each, the value aligned right", () => {
    const value = "Avenida Siempre Viva 742, Springfield, Buenos";
    expect(labeledValue("Sucursal", value)).toEqual(["Sucursal", value.padStart(48)]);
  });

  it("wraps a value wider than the paper on lines aligned right", () => {
    expect(labeledValue("Caja", `${"x".repeat(40)} ${"y".repeat(20)}`)).toEqual([
      "Caja",
      `${" ".repeat(8)}${"x".repeat(40)}`,
      `${" ".repeat(28)}${"y".repeat(20)}`,
    ]);
  });

  it("lays out a row in the small font's sixty-four columns", () => {
    expect(row("CUIT", "IIBB", "", SMALL_COLUMNS)).toEqual([`CUIT${" ".repeat(56)}IIBB`]);
  });
});

describe("joining printed bytes", () => {
  it("joins chunks in order", () => {
    expect(
      Array.from(concatenated([Uint8Array.of(1, 2), Uint8Array.of(), Uint8Array.of(3)])),
    ).toEqual([1, 2, 3]);
  });
});
