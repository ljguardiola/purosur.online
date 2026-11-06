import { describe, expect, expectTypeOf, it } from "vitest";
import { type PrinterLabels, printerLabelsSchema } from "./printer-labels.js";

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
