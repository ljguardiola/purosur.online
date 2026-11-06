import { ean13Modules } from "@purosur/domain";
import type { LabelSheetItem } from "@purosur/domain/catalog/use-cases";
import { describe, expect, it } from "vitest";
import {
  PRINTER_LABEL_HEIGHT_DOTS,
  PRINTER_LABEL_WIDTH_DOTS,
  renderPrinterLabelRaster,
} from "./printer-label-raster.js";

const CODE = "2000000000015";
const MODULE_DOTS = 3;
const BARCODE_BOX_DOTS = 113 * MODULE_DOTS;
const BARCODE_ORIGIN = Math.floor((PRINTER_LABEL_WIDTH_DOTS - BARCODE_BOX_DOTS) / 2);
const FIRST_MODULE_COLUMN = BARCODE_ORIGIN + 11 * MODULE_DOTS;
const MARGIN_DOTS = 12;

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
  constructor(private readonly bytes: Uint8Array) {}

  isBlack(x: number, y: number): boolean {
    const byte = this.bytes[y * (PRINTER_LABEL_WIDTH_DOTS / 8) + (x >> 3)] ?? 0;
    return (byte & (0x80 >> (x & 7))) !== 0;
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
    return this.rowIsBlankBetween(row, 0, PRINTER_LABEL_WIDTH_DOTS);
  }

  blackRows(): number[] {
    return Array.from({ length: PRINTER_LABEL_HEIGHT_DOTS }, (_, row) => row).filter(
      (row) => !this.rowIsBlank(row),
    );
  }

  blackColumns(): number[] {
    return Array.from({ length: PRINTER_LABEL_WIDTH_DOTS }, (_, column) => column).filter(
      (column) =>
        Array.from({ length: PRINTER_LABEL_HEIGHT_DOTS }, (_, row) => row).some((row) =>
          this.isBlack(column, row),
        ),
    );
  }

  rowDecodesToBarcode(row: number, modules: string): boolean {
    for (let index = 0; index < modules.length; index += 1) {
      const expected = modules[index] === "1";
      for (let dot = 0; dot < MODULE_DOTS; dot += 1) {
        if (this.isBlack(FIRST_MODULE_COLUMN + index * MODULE_DOTS + dot, row) !== expected) {
          return false;
        }
      }
    }
    return (
      this.rowIsBlankBetween(row, 0, FIRST_MODULE_COLUMN) &&
      this.rowIsBlankBetween(
        row,
        FIRST_MODULE_COLUMN + modules.length * MODULE_DOTS,
        PRINTER_LABEL_WIDTH_DOTS,
      )
    );
  }

  barRows(modules: string): number[] {
    return Array.from({ length: PRINTER_LABEL_HEIGHT_DOTS }, (_, row) => row).filter((row) =>
      this.rowDecodesToBarcode(row, modules),
    );
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

function render(overrides: Partial<LabelSheetItem> = {}): Raster {
  return new Raster(renderPrinterLabelRaster(item(overrides)));
}

describe("renderPrinterLabelRaster", () => {
  it("is a 50 x 30 mm label at 8 dots per millimetre", () => {
    expect(PRINTER_LABEL_WIDTH_DOTS).toBe(400);
    expect(PRINTER_LABEL_HEIGHT_DOTS).toBe(240);
  });

  it("packs the rows top to bottom, each row of width / 8 bytes", () => {
    expect(renderPrinterLabelRaster(item())).toHaveLength((400 / 8) * 240);
  });

  it("draws the bars so that each row of them reads back as the code's modules", () => {
    const raster = render();
    const modules = ean13Modules(CODE);

    const rows = raster.barRows(modules);

    expect(rows).toHaveLength(96);
    expect(rows[95]).toBe((rows[0] ?? 0) + 95);
  });

  it("makes every bar a whole number of 3 dots, at whole dots", () => {
    const raster = render();
    const [row] = raster.barRows(ean13Modules(CODE));

    const runs: number[] = [];
    let run = 0;
    for (let x = 0; x <= PRINTER_LABEL_WIDTH_DOTS; x += 1) {
      if (x < PRINTER_LABEL_WIDTH_DOTS && raster.isBlack(x, row ?? 0)) {
        run += 1;
      } else if (run > 0) {
        runs.push(run);
        run = 0;
      }
    }

    expect(runs.length).toBeGreaterThan(0);
    for (const length of runs) {
      expect(length % MODULE_DOTS).toBe(0);
    }
  });

  it("centers the barcode and its quiet zones horizontally", () => {
    const raster = render();
    const [row] = raster.barRows(ean13Modules(CODE));

    expect(raster.isBlack(FIRST_MODULE_COLUMN, row ?? 0)).toBe(true);
    expect(BARCODE_ORIGIN).toBe(30);
  });

  it("extends the guard bars below the other bars", () => {
    const raster = render();
    const rows = raster.barRows(ean13Modules(CODE));
    const lastBarRow = rows[rows.length - 1] ?? 0;

    expect(raster.isBlack(FIRST_MODULE_COLUMN, lastBarRow + 16)).toBe(true);
    expect(raster.isBlack(FIRST_MODULE_COLUMN + 3 * MODULE_DOTS, lastBarRow + 1)).toBe(false);
  });

  it("writes the digits under the bars, inside the barcode's width", () => {
    const raster = render();
    const rows = raster.barRows(ean13Modules(CODE));
    const lastBarRow = rows[rows.length - 1] ?? 0;
    const digitRows = raster.blackRows().filter((row) => row > lastBarRow + 16);

    expect(digitRows.length).toBeGreaterThan(10);
    for (const row of digitRows) {
      expect(
        raster.rowIsBlankBetween(row, BARCODE_ORIGIN + BARCODE_BOX_DOTS, PRINTER_LABEL_WIDTH_DOTS),
      ).toBe(true);
      expect(raster.rowIsBlankBetween(row, 0, BARCODE_ORIGIN)).toBe(true);
    }
  });

  it("draws the description on one line, centered, above the barcode", () => {
    const raster = render();
    const [firstBarRow] = raster.barRows(ean13Modules(CODE));
    const runs = raster.textRuns(firstBarRow ?? 0);
    const description = runs[0];
    const columns = raster.blackColumns();

    expect(runs).toHaveLength(1);
    expect(description?.[1]).toBeLessThan((firstBarRow ?? 0) - 1);
    let left = PRINTER_LABEL_WIDTH_DOTS;
    let right = -1;
    for (let row = description?.[0] ?? 0; row <= (description?.[1] ?? 0); row += 1) {
      for (const column of columns) {
        if (raster.isBlack(column, row)) {
          left = Math.min(left, column);
          right = Math.max(right, column);
        }
      }
    }
    expect(Math.abs(left - (PRINTER_LABEL_WIDTH_DOTS - 1 - right))).toBeLessThanOrEqual(3);
  });

  it("brings the brand and the net content into the description", () => {
    const plain = render({ name: "ALMENDRAS" });
    const full = render({
      name: "ALMENDRAS",
      brandName: "CAMPO",
      netContent: { quantity: 500, unit: "G" },
    });
    const widthOf = (raster: Raster) => {
      const [firstBarRow] = raster.barRows(ean13Modules(CODE));
      const columns = new Set<number>();
      for (const row of raster.blackRows().filter((r) => r < (firstBarRow ?? 0))) {
        for (let x = 0; x < PRINTER_LABEL_WIDTH_DOTS; x += 1) {
          if (raster.isBlack(x, row)) {
            columns.add(x);
          }
        }
      }
      return Math.max(...columns) - Math.min(...columns);
    };

    expect(widthOf(full)).toBeGreaterThan(widthOf(plain));
  });

  it("wraps a long description onto a second line", () => {
    const raster = render({ name: "ALMENDRAS PELADAS NATURALES SIN SAL" });
    const [firstBarRow] = raster.barRows(ean13Modules(CODE));

    expect(raster.textRuns(firstBarRow ?? 0)).toHaveLength(2);
  });

  it("stops a very long description at two lines", () => {
    const raster = render({
      name: "ALMENDRAS PELADAS NATURALES SIN SAL DE LA SIERRA CON CAROZO TOSTADAS AL HORNO DE LEÑA",
    });
    const [firstBarRow] = raster.barRows(ean13Modules(CODE));

    expect(raster.textRuns(firstBarRow ?? 0)).toHaveLength(2);
  });

  it("keeps a word wider than the label inside the content area", () => {
    const raster = render({ name: "SUPERCALIFRAGILISTICOESPIALIDOSOYMASYMASYMAS" });
    const [firstBarRow] = raster.barRows(ean13Modules(CODE));
    const columns = raster.blackColumns();

    expect(raster.textRuns(firstBarRow ?? 0).length).toBeLessThanOrEqual(2);
    expect(Math.min(...columns)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...columns)).toBeLessThan(PRINTER_LABEL_WIDTH_DOTS - 16);
  });

  it.each([
    ["short", "YERBA MATE"],
    ["long", "ALMENDRAS PELADAS NATURALES SIN SAL DE LA SIERRA CON CAROZO TOSTADAS AL HORNO"],
  ])("leaves the margins at the top and the bottom clear for a %s description", (_, name) => {
    const rows = render({ name }).blackRows();
    const first = rows[0] ?? 0;
    const last = rows[rows.length - 1] ?? 0;

    expect(first).toBeGreaterThanOrEqual(MARGIN_DOTS);
    expect(PRINTER_LABEL_HEIGHT_DOTS - 1 - last).toBeGreaterThanOrEqual(MARGIN_DOTS);
    expect(Math.abs(first - (PRINTER_LABEL_HEIGHT_DOTS - 1 - last))).toBeLessThanOrEqual(8);
  });

  it("moves the barcode down when the description takes a second line", () => {
    const one = render({ name: "YERBA" }).barRows(ean13Modules(CODE))[0] ?? 0;
    const two =
      render({ name: "ALMENDRAS PELADAS NATURALES SIN SAL" }).barRows(ean13Modules(CODE))[0] ?? 0;

    expect(two).toBeGreaterThan(one);
  });

  it("leaves nothing at the sides of the content area", () => {
    const columns = render({
      name: "ALMENDRAS PELADAS NATURALES SIN SAL DE LA SIERRA CON CAROZO TOSTADAS AL HORNO",
    }).blackColumns();

    expect(Math.min(...columns)).toBeGreaterThanOrEqual(16);
    expect(Math.max(...columns)).toBeLessThan(PRINTER_LABEL_WIDTH_DOTS - 16);
  });

  it("answers the same raster for the same item", () => {
    expect(renderPrinterLabelRaster(item())).toEqual(renderPrinterLabelRaster(item()));
  });

  it("draws other codes with their own modules", () => {
    const code = "2000000000022";
    const raster = new Raster(renderPrinterLabelRaster(item({ code })));

    expect(raster.barRows(ean13Modules(code))).toHaveLength(96);
    expect(raster.barRows(ean13Modules(CODE))).toHaveLength(0);
  });
});
