import { describe, expect, expectTypeOf, it } from "vitest";
import {
  LABEL_PRINTER_HEIGHT_MM,
  LABEL_PRINTER_WIDTH_MM,
  type LabelPrintsBody,
  labelPrintsBodySchema,
  type PrinterLabelSize,
  type PrinterLabels,
  printerLabelSizeSchema,
  printerLabelsSchema,
} from "./printer-labels.js";

function rasterOf(byteCount: number): string {
  return Buffer.alloc(byteCount, 0xa5).toString("base64");
}

function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    widthDots: 16,
    heightDots: 3,
    labels: [{ copies: 2, rows: rasterOf(6) }],
    ...overrides,
  };
}

function firstIssue(body: unknown): { path: unknown[]; message: string } | undefined {
  const result = printerLabelsSchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { path: issue.path, message: issue.message };
}

function firstIssuePath(body: unknown): unknown[] | undefined {
  return firstIssue(body)?.path;
}

describe("printerLabelsSchema", () => {
  it("accepts labels whose raster holds widthDots / 8 bytes for each of heightDots rows", () => {
    const result = printerLabelsSchema.safeParse(answer());

    expect(result.success).toBe(true);
    expect(result.data).toEqual(answer());
    expectTypeOf<PrinterLabels>().toExtend<{ widthDots: number; heightDots: number }>();
  });

  it("accepts several labels", () => {
    const labels = [
      { copies: 1, rows: rasterOf(6) },
      { copies: 5, rows: rasterOf(6) },
    ];

    expect(printerLabelsSchema.safeParse(answer({ labels })).success).toBe(true);
  });

  it("accepts an empty list of labels", () => {
    expect(printerLabelsSchema.safeParse(answer({ labels: [] })).success).toBe(true);
  });

  it.each([0, -8, 12, 2.5, "16"])("refuses a width of %s dots", (widthDots) => {
    expect(printerLabelsSchema.safeParse(answer({ widthDots })).success).toBe(false);
  });

  it("says a width that is not a whole number of bytes is not a multiple of 8", () => {
    const body = answer({
      widthDots: 12,
      heightDots: 4,
      labels: [{ copies: 1, rows: rasterOf(6) }],
    });

    expect(firstIssue(body)).toEqual({
      path: ["widthDots"],
      message: "widthDots must be a multiple of 8",
    });
  });

  it("says what a raster of the wrong length should hold", () => {
    const labels = [{ copies: 1, rows: rasterOf(5) }];

    expect(firstIssue(answer({ labels }))?.message).toBe(
      "rows must hold widthDots / 8 bytes for each of heightDots rows",
    );
  });

  it.each([0, -1, 1.5, "3"])("refuses a height of %s dots", (heightDots) => {
    expect(printerLabelsSchema.safeParse(answer({ heightDots })).success).toBe(false);
  });

  it.each([0, -1, 1.5, "2"])("refuses %s copies", (copies) => {
    expect(
      printerLabelsSchema.safeParse(answer({ labels: [{ copies, rows: rasterOf(6) }] })).success,
    ).toBe(false);
  });

  it("refuses a raster that is not base64", () => {
    expect(
      printerLabelsSchema.safeParse(answer({ labels: [{ copies: 1, rows: "not base64!" }] }))
        .success,
    ).toBe(false);
  });

  it.each([5, 7, 0])("refuses a raster of %s bytes where 6 are needed", (byteCount) => {
    const labels = [{ copies: 1, rows: rasterOf(byteCount) }];

    expect(firstIssuePath(answer({ labels }))).toEqual(["labels", 0, "rows"]);
  });

  it("names the label whose raster has the wrong length", () => {
    const labels = [
      { copies: 1, rows: rasterOf(6) },
      { copies: 1, rows: rasterOf(7) },
    ];

    expect(firstIssuePath(answer({ labels }))).toEqual(["labels", 1, "rows"]);
  });

  it("measures the raster against the answer's own size", () => {
    const body = answer({
      widthDots: 400,
      heightDots: 240,
      labels: [{ copies: 1, rows: rasterOf(50 * 240) }],
    });

    expect(printerLabelsSchema.safeParse(body).success).toBe(true);
    expect(
      printerLabelsSchema.safeParse({ ...body, labels: [{ copies: 1, rows: rasterOf(6) }] })
        .success,
    ).toBe(false);
  });

  it("counts the bytes of a raster whose base64 ends in padding", () => {
    const body = answer({
      widthDots: 8,
      heightDots: 2,
      labels: [{ copies: 1, rows: rasterOf(2) }],
    });
    const longer = answer({
      widthDots: 8,
      heightDots: 2,
      labels: [{ copies: 1, rows: rasterOf(1) }],
    });

    expect(printerLabelsSchema.safeParse(body).success).toBe(true);
    expect(printerLabelsSchema.safeParse(longer).success).toBe(false);
  });
});

describe("printerLabelSizeSchema", () => {
  it("accepts a whole-millimetre size inside the label printer's ranges", () => {
    const result = printerLabelSizeSchema.safeParse({ widthMm: 50, heightMm: 30 });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ widthMm: 50, heightMm: 30 });
    expectTypeOf<PrinterLabelSize>().toEqualTypeOf<{ widthMm: number; heightMm: number }>();
  });

  it("names the printer's width range from 25 to 70 mm and height range from 15 to 70 mm", () => {
    expect(LABEL_PRINTER_WIDTH_MM).toEqual({ min: 25, max: 70 });
    expect(LABEL_PRINTER_HEIGHT_MM).toEqual({ min: 15, max: 70 });
  });

  it.each([
    [25, 15],
    [70, 70],
  ])("accepts the range edges %s x %s mm", (widthMm, heightMm) => {
    expect(printerLabelSizeSchema.safeParse({ widthMm, heightMm }).success).toBe(true);
  });

  it.each([24, 71, 40.5, "50", undefined])("refuses a width of %s mm", (widthMm) => {
    const result = printerLabelSizeSchema.safeParse({ widthMm, heightMm: 30 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["widthMm"]);
    expect(result.error?.issues[0]?.message).toBe(
      "widthMm must be a whole number of millimetres from 25 to 70",
    );
  });

  it.each([14, 71, 20.5, "30", undefined])("refuses a height of %s mm", (heightMm) => {
    const result = printerLabelSizeSchema.safeParse({ widthMm: 50, heightMm });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["heightMm"]);
    expect(result.error?.issues[0]?.message).toBe(
      "heightMm must be a whole number of millimetres from 15 to 70",
    );
  });
});

describe("labelPrintsBodySchema", () => {
  const labels = [{ productId: "11111111-1111-1111-1111-111111111111", count: 2 }];

  it("accepts the labels to print with the size of the loaded roll", () => {
    const result = labelPrintsBodySchema.safeParse({
      labels,
      size: { widthMm: 40, heightMm: 25 },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ labels, size: { widthMm: 40, heightMm: 25 } });
    expectTypeOf<LabelPrintsBody>().toExtend<{ size: PrinterLabelSize }>();
  });

  it("refuses labels sent without a size", () => {
    expect(labelPrintsBodySchema.safeParse({ labels }).success).toBe(false);
  });

  it("refuses a size outside the ranges at the size's own field", () => {
    const result = labelPrintsBodySchema.safeParse({
      labels,
      size: { widthMm: 80, heightMm: 25 },
    });

    expect(result.error?.issues[0]?.path).toEqual(["size", "widthMm"]);
  });

  it("refuses the labels the A4 sheet would refuse", () => {
    const result = labelPrintsBodySchema.safeParse({
      labels: [],
      size: { widthMm: 40, heightMm: 25 },
    });

    expect(result.error?.issues[0]?.path).toEqual(["labels"]);
  });
});
