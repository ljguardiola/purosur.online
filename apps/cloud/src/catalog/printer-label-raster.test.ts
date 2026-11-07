import { ean13Modules } from "@purosur/domain";
import type { LabelSheetItem } from "@purosur/domain/catalog/use-cases";
import { describe, expect, it } from "vitest";
import { renderPrinterLabelRaster } from "./printer-label-raster.js";

const CODE = "2000000000015";
const MODULES = ean13Modules(CODE);
const BARCODE_MODULES = 95;
const BOX_MODULES = 113;
const LONG_NAME =
  "ALMENDRAS PELADAS NATURALES SIN SAL DE LA SIERRA CON CAROZO TOSTADAS AL HORNO DE LEÑA";

interface SizeCase {
  widthMm: number;
  heightMm: number;
  moduleDots: number;
  barHeight: number;
  guardExtra: number;
  lines: number;
  marginDots: number;
  sideDots: number;
  narrow: boolean;
}

const SIZES: SizeCase[] = [
  {
    widthMm: 25,
    heightMm: 15,
    moduleDots: 2,
    barHeight: 59,
    guardExtra: 11,
    lines: 1,
    marginDots: 6,
    sideDots: 8,
    narrow: true,
  },
  {
    widthMm: 40,
    heightMm: 25,
    moduleDots: 2,
    barHeight: 64,
    guardExtra: 11,
    lines: 3,
    marginDots: 10,
    sideDots: 13,
    narrow: false,
  },
  {
    widthMm: 50,
    heightMm: 30,
    moduleDots: 3,
    barHeight: 96,
    guardExtra: 16,
    lines: 2,
    marginDots: 12,
    sideDots: 16,
    narrow: false,
  },
  {
    widthMm: 70,
    heightMm: 50,
    moduleDots: 4,
    barHeight: 128,
    guardExtra: 21,
    lines: 3,
    marginDots: 17,
    sideDots: 22,
    narrow: false,
  },
];

const SIZE_50 = SIZES[2] as SizeCase;

function item(overrides: Partial<LabelSheetItem> = {}): LabelSheetItem {
  return {
    name: "YERBA MATE",
    brandName: null,
    netContent: null,
    code: CODE,
    count: 1,
    ...overrides,
  };
}

class Raster {
  readonly width: number;
  readonly height: number;
  private readonly bytes: Uint8Array;

  constructor(raster: { widthDots: number; heightDots: number; rows: Uint8Array }) {
    this.width = raster.widthDots;
    this.height = raster.heightDots;
    this.bytes = raster.rows;
  }

  isBlack(x: number, y: number): boolean {
    const byte = this.bytes[y * (this.width / 8) + (x >> 3)] ?? 0;
    return (byte & (0x80 >> (x & 7))) !== 0;
  }

  firstBlackColumn(row: number): number {
    for (let x = 0; x < this.width; x += 1) {
      if (this.isBlack(x, row)) {
        return x;
      }
    }
    return -1;
  }

  rowIsBlankBetween(row: number, from: number, to: number): boolean {
    for (let x = from; x < to; x += 1) {
      if (this.isBlack(x, row)) {
        return false;
      }
    }
    return true;
  }

  rowIsBlank(row: number): boolean {
    return this.rowIsBlankBetween(row, 0, this.width);
  }

  blackRows(): number[] {
    return Array.from({ length: this.height }, (_, row) => row).filter(
      (row) => !this.rowIsBlank(row),
    );
  }

  blackColumns(fromRow = 0, untilRow = this.height): number[] {
    return Array.from({ length: this.width }, (_, column) => column).filter((column) =>
      Array.from({ length: untilRow - fromRow }, (_, offset) => fromRow + offset).some((row) =>
        this.isBlack(column, row),
      ),
    );
  }

  rowDecodesToBarcode(row: number, modules: string, moduleDots: number): boolean {
    const first = this.firstBlackColumn(row);
    if (first < 0) {
      return false;
    }
    for (let index = 0; index < modules.length; index += 1) {
      const expected = modules[index] === "1";
      for (let dot = 0; dot < moduleDots; dot += 1) {
        if (this.isBlack(first + index * moduleDots + dot, row) !== expected) {
          return false;
        }
      }
    }
    return this.rowIsBlankBetween(row, first + modules.length * moduleDots, this.width);
  }

  barRows(modules: string, moduleDots: number): number[] {
    return Array.from({ length: this.height }, (_, row) => row).filter((row) =>
      this.rowDecodesToBarcode(row, modules, moduleDots),
    );
  }

  portableBitmap(): string {
    const rows = Array.from({ length: this.height }, (_, row) =>
      Array.from({ length: this.width }, (_, column) =>
        this.isBlack(column, row) ? "1" : "0",
      ).join(""),
    );
    return ["P1", `${this.width} ${this.height}`, ...rows, ""].join("\n");
  }

  textRuns(untilRow: number): Array<[number, number]> {
    const runs: Array<[number, number]> = [];
    for (let row = 0; row < untilRow; row += 1) {
      if (this.rowIsBlank(row)) {
        continue;
      }
      const last = runs[runs.length - 1];
      if (last && last[1] === row - 1) {
        last[1] = row;
      } else {
        runs.push([row, row]);
      }
    }
    return runs;
  }
}

function render(overrides: Partial<LabelSheetItem> = {}, size: SizeCase = SIZE_50): Raster {
  return new Raster(
    renderPrinterLabelRaster(item(overrides), { widthMm: size.widthMm, heightMm: size.heightMm }),
  );
}

function barcodeLeft(raster: Raster, size: SizeCase): number {
  const [row] = raster.barRows(MODULES, size.moduleDots);
  return raster.firstBlackColumn(row ?? 0);
}

const label = (size: SizeCase) => `${size.widthMm} x ${size.heightMm} mm`;

describe("renderPrinterLabelRaster", () => {
  it.each(SIZES)("is a $widthMm x $heightMm mm label at 8 dots per millimetre", (size) => {
    const raster = renderPrinterLabelRaster(item(), size);

    expect(raster.widthDots).toBe(size.widthMm * 8);
    expect(raster.heightDots).toBe(size.heightMm * 8);
  });

  it.each(SIZES)(
    "packs the rows of a $widthMm x $heightMm mm label, each of width / 8 bytes",
    (size) => {
      const { rows } = renderPrinterLabelRaster(item(), size);

      expect(rows).toHaveLength(size.widthMm * size.heightMm * 8);
    },
  );

  it.each(SIZES)(
    "draws the bars of a $widthMm x $heightMm mm label as the code's modules at the largest module width that fits",
    (size) => {
      const raster = render({}, size);

      const rows = raster.barRows(MODULES, size.moduleDots);

      expect(rows).toHaveLength(size.barHeight);
      expect(rows[rows.length - 1]).toBe((rows[0] ?? 0) + size.barHeight - 1);
    },
  );

  it.each(SIZES)(
    "makes every bar of a $widthMm x $heightMm mm label a whole number of module dots",
    (size) => {
      const raster = render({}, size);
      const [row] = raster.barRows(MODULES, size.moduleDots);

      const runs: number[] = [];
      let run = 0;
      for (let x = 0; x <= raster.width; x += 1) {
        if (x < raster.width && raster.isBlack(x, row ?? 0)) {
          run += 1;
        } else if (run > 0) {
          runs.push(run);
          run = 0;
        }
      }

      expect(runs.length).toBeGreaterThan(0);
      for (const length of runs) {
        expect(length % size.moduleDots).toBe(0);
      }
    },
  );

  it.each(SIZES)(
    "keeps the bars of a $widthMm x $heightMm mm label inside it with a quiet zone on each side",
    (size) => {
      const raster = render({}, size);
      const left = barcodeLeft(raster, size);
      const right = raster.width - (left + BARCODE_MODULES * size.moduleDots);

      expect(left).toBeGreaterThanOrEqual(4);
      expect(right).toBeGreaterThanOrEqual(4);
    },
  );

  it.each(SIZES.filter((size) => !size.narrow))(
    "centers the barcode and its standard quiet zones in a $widthMm x $heightMm mm label",
    (size) => {
      const raster = render({}, size);
      const origin = Math.floor((raster.width - BOX_MODULES * size.moduleDots) / 2);

      expect(barcodeLeft(raster, size)).toBe(origin + 11 * size.moduleDots);
    },
  );

  it("centers the bars of a label too narrow for the standard quiet zones", () => {
    const size = SIZES[0] as SizeCase;
    const raster = render({}, size);

    expect(barcodeLeft(raster, size)).toBe(
      Math.floor((raster.width - BARCODE_MODULES * size.moduleDots) / 2),
    );
  });

  it.each(SIZES)(
    "extends the guard bars of a $widthMm x $heightMm mm label below the other bars",
    (size) => {
      const raster = render({}, size);
      const rows = raster.barRows(MODULES, size.moduleDots);
      const lastBarRow = rows[rows.length - 1] ?? 0;
      const left = barcodeLeft(raster, size);

      expect(raster.isBlack(left, lastBarRow + size.guardExtra)).toBe(true);
      expect(raster.isBlack(left, lastBarRow + size.guardExtra + 1)).toBe(false);
      expect(raster.isBlack(left + 3 * size.moduleDots, lastBarRow + 1)).toBe(false);
    },
  );

  it("writes the digits of a standard label under the bars, inside the barcode's box", () => {
    const size = SIZE_50;
    const raster = render({}, size);
    const rows = raster.barRows(MODULES, size.moduleDots);
    const lastBarRow = rows[rows.length - 1] ?? 0;
    const digitRows = raster.blackRows().filter((row) => row > lastBarRow + size.guardExtra);
    const origin = Math.floor((raster.width - BOX_MODULES * size.moduleDots) / 2);

    expect(digitRows.length).toBeGreaterThan(10);
    for (const row of digitRows) {
      expect(
        raster.rowIsBlankBetween(row, origin + BOX_MODULES * size.moduleDots, raster.width),
      ).toBe(true);
      expect(raster.rowIsBlankBetween(row, 0, origin)).toBe(true);
    }
    expect(raster.blackColumns(digitRows[0] ?? 0)[0]).toBeLessThan(barcodeLeft(raster, size));
  });

  it("writes the digits of a narrow label as one centered line under the bars", () => {
    const size = SIZES[0] as SizeCase;
    const raster = render({}, size);
    const rows = raster.barRows(MODULES, size.moduleDots);
    const lastBarRow = rows[rows.length - 1] ?? 0;
    const digitRows = raster.blackRows().filter((row) => row > lastBarRow + size.guardExtra);
    const columns = raster.blackColumns(digitRows[0] ?? 0, (digitRows.at(-1) ?? 0) + 1);
    const left = columns[0] ?? 0;
    const right = columns.at(-1) ?? 0;
    const barsLeft = barcodeLeft(raster, size);

    expect(digitRows.length).toBeGreaterThan(10);
    expect(digitRows.at(-1)).toBeLessThan(raster.height - size.marginDots);
    expect(left).toBeGreaterThanOrEqual(barsLeft);
    expect(right).toBeLessThan(barsLeft + BARCODE_MODULES * size.moduleDots);
    expect(Math.abs(left - (raster.width - 1 - right))).toBeLessThanOrEqual(3);
  });

  it.each(SIZES)(
    "draws a short description of a $widthMm x $heightMm mm label on one centered line above the barcode",
    (size) => {
      const raster = render({}, size);
      const [firstBarRow] = raster.barRows(MODULES, size.moduleDots);
      const runs = raster.textRuns(firstBarRow ?? 0);
      const description = runs[0];
      const columns = raster.blackColumns(description?.[0] ?? 0, (description?.[1] ?? 0) + 1);

      expect(runs).toHaveLength(1);
      expect(description?.[1]).toBeLessThan((firstBarRow ?? 0) - 1);
      expect(
        Math.abs((columns[0] ?? 0) - (raster.width - 1 - (columns.at(-1) ?? 0))),
      ).toBeLessThanOrEqual(3);
    },
  );

  it("brings the brand and the net content into the description", () => {
    const plain = render({ name: "ALMENDRAS" });
    const full = render({
      name: "ALMENDRAS",
      brandName: "CAMPO",
      netContent: { quantity: 500, unit: "G" },
    });
    const widthOf = (raster: Raster) => {
      const [firstBarRow] = raster.barRows(MODULES, SIZE_50.moduleDots);
      const columns = raster.blackColumns(0, firstBarRow ?? 0);
      return Math.max(...columns) - Math.min(...columns);
    };

    expect(widthOf(full)).toBeGreaterThan(widthOf(plain));
  });

  it.each(SIZES)(
    "fills a $widthMm x $heightMm mm label with as many description lines as fit, never overlapping the barcode",
    (size) => {
      const raster = render({ name: LONG_NAME }, size);
      const [firstBarRow] = raster.barRows(MODULES, size.moduleDots);
      const runs = raster.textRuns(firstBarRow ?? 0);

      expect(runs).toHaveLength(size.lines);
      expect(runs.at(-1)?.[1]).toBeLessThan((firstBarRow ?? 0) - 1);
    },
  );

  it.each(SIZES.filter((size) => size.lines > 1))(
    "wraps a description of a $widthMm x $heightMm mm label that does not fit one line onto a second",
    (size) => {
      const raster = render({ name: "ALMENDRAS PELADAS NATURALES SIN SAL" }, size);
      const [firstBarRow] = raster.barRows(MODULES, size.moduleDots);

      expect(raster.textRuns(firstBarRow ?? 0).length).toBeGreaterThanOrEqual(2);
    },
  );

  it("keeps a word wider than the label inside the content area", () => {
    const size = SIZE_50;
    const raster = render({ name: "SUPERCALIFRAGILISTICOESPIALIDOSOYMASYMASYMAS" }, size);
    const [firstBarRow] = raster.barRows(MODULES, size.moduleDots);
    const columns = raster.blackColumns(0, firstBarRow ?? 0);

    expect(raster.textRuns(firstBarRow ?? 0).length).toBeLessThanOrEqual(size.lines);
    expect(Math.min(...columns)).toBeGreaterThanOrEqual(size.sideDots);
    expect(Math.max(...columns)).toBeLessThan(raster.width - size.sideDots);
  });

  it.each(SIZES)(
    "leaves the side margins of a $widthMm x $heightMm mm label clear of description",
    (size) => {
      const raster = render({ name: LONG_NAME }, size);
      const [firstBarRow] = raster.barRows(MODULES, size.moduleDots);
      const columns = raster.blackColumns(0, firstBarRow ?? 0);

      expect(Math.min(...columns)).toBeGreaterThanOrEqual(size.sideDots);
      expect(Math.max(...columns)).toBeLessThan(raster.width - size.sideDots);
    },
  );

  it.each(
    SIZES.flatMap((size) => [
      [label(size), "short", "YERBA MATE", size] as const,
      [label(size), "long", LONG_NAME, size] as const,
    ]),
  )(
    "leaves the margins at the top and the bottom of a %s label clear for a %s description",
    (_, __, name, size) => {
      const rows = render({ name }, size).blackRows();
      const first = rows[0] ?? 0;
      const last = rows.at(-1) ?? 0;
      const heightDots = size.heightMm * 8;

      expect(first).toBeGreaterThanOrEqual(size.marginDots);
      expect(heightDots - 1 - last).toBeGreaterThanOrEqual(size.marginDots);
      expect(Math.abs(first - (heightDots - 1 - last))).toBeLessThanOrEqual(8);
    },
  );

  it("moves the barcode down when the description takes a second line", () => {
    const one = render({ name: "YERBA" }).barRows(MODULES, SIZE_50.moduleDots)[0] ?? 0;
    const two =
      render({ name: "ALMENDRAS PELADAS NATURALES SIN SAL" }).barRows(
        MODULES,
        SIZE_50.moduleDots,
      )[0] ?? 0;

    expect(two).toBeGreaterThan(one);
  });

  it("answers the same raster for the same item and size", () => {
    const size = { widthMm: 40, heightMm: 25 };

    expect(renderPrinterLabelRaster(item(), size)).toEqual(renderPrinterLabelRaster(item(), size));
  });

  it("draws other codes with their own modules", () => {
    const code = "2000000000022";
    const raster = new Raster(
      renderPrinterLabelRaster(item({ code }), { widthMm: 50, heightMm: 30 }),
    );

    expect(raster.barRows(ean13Modules(code), 3)).toHaveLength(96);
    expect(raster.barRows(MODULES, 3)).toHaveLength(0);
  });

  it.each(SIZES)(
    "prints a product with its brand and net content exactly as the expected $widthMm x $heightMm mm label",
    async (size) => {
      const raster = render(
        {
          name: "ALMENDRAS PELADAS NATURALES SIN SAL",
          brandName: "CAMPO",
          netContent: { quantity: 500, unit: "G" },
        },
        size,
      );
      const fixture =
        size === SIZE_50
          ? "printer-label-raster.pbm"
          : `printer-label-raster-${size.widthMm}x${size.heightMm}.pbm`;

      await expect(raster.portableBitmap()).toMatchFileSnapshot(`./test-support/${fixture}`);
    },
  );
});
