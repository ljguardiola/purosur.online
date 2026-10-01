import { LABELS_MAX_COUNT_PER_PRODUCT, LABELS_MAX_TOTAL_COUNT } from "@purosur/domain";
import { describe, expect, expectTypeOf, it } from "vitest";
import { type LabelSheetBody, labelSheetBodySchema } from "./label-sheet.js";

const PRODUCT_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_PRODUCT_ID = "22222222-2222-2222-2222-222222222222";
const THIRD_PRODUCT_ID = "33333333-3333-3333-3333-333333333333";

const LIST_MESSAGE = "labels must be a non-empty list of { productId, count }";
const ENTRY_MESSAGE = `each label must have an existing product's id and a count between 1 and ${LABELS_MAX_COUNT_PER_PRODUCT}`;
const REPEATED_MESSAGE = "the same productId was sent more than once";
const TOTAL_MESSAGE = `the total label count must be at most ${LABELS_MAX_TOTAL_COUNT}`;

function firstIssue(body: unknown): { field: unknown; message: string } | undefined {
  const result = labelSheetBodySchema.safeParse(body);
  const issue = result.success ? undefined : result.error.issues[0];
  return issue && { field: issue.path[0], message: issue.message };
}

describe("labelSheetBodySchema", () => {
  it("accepts a list of products with the number of labels of each", () => {
    expect(
      labelSheetBodySchema.safeParse({
        labels: [
          { productId: PRODUCT_ID, count: 2 },
          { productId: OTHER_PRODUCT_ID, count: 1 },
        ],
      }),
    ).toMatchObject({
      success: true,
      data: {
        labels: [
          { productId: PRODUCT_ID, count: 2 },
          { productId: OTHER_PRODUCT_ID, count: 1 },
        ],
      },
    });
  });

  it("returns each product's id in lower case", () => {
    const result = labelSheetBodySchema.safeParse({
      labels: [{ productId: "ABCDEF00-1111-1111-1111-111111111111", count: 1 }],
    });

    expect(result).toMatchObject({
      success: true,
      data: { labels: [{ productId: "abcdef00-1111-1111-1111-111111111111", count: 1 }] },
    });
  });

  it("accepts an id with unusual version and variant digits", () => {
    expect(
      labelSheetBodySchema.safeParse({
        labels: [{ productId: "00000000-0000-0000-0000-000000000000", count: 1 }],
      }).success,
    ).toBe(true);
  });

  it("accepts the smallest and the largest count of one product", () => {
    expect(
      labelSheetBodySchema.safeParse({
        labels: [
          { productId: PRODUCT_ID, count: 1 },
          { productId: OTHER_PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a total exactly at the limit", () => {
    const perProduct = LABELS_MAX_TOTAL_COUNT - LABELS_MAX_COUNT_PER_PRODUCT * 2;
    expect(
      labelSheetBodySchema.safeParse({
        labels: [
          { productId: PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: OTHER_PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: THIRD_PRODUCT_ID, count: perProduct },
        ],
      }).success,
    ).toBe(true);
  });

  it.each([undefined, null, "labels", 42, {}, []])("rejects the list %j", (labels) => {
    expect(firstIssue({ labels })).toEqual({ field: "labels", message: LIST_MESSAGE });
  });

  it.each([
    undefined,
    null,
    "entry",
    42,
    {},
    [],
    { count: 1 },
    { productId: PRODUCT_ID },
    { productId: 42, count: 1 },
    { productId: "", count: 1 },
    { productId: "not-a-uuid", count: 1 },
    { productId: `${PRODUCT_ID}0`, count: 1 },
    { productId: `${PRODUCT_ID}\n`, count: 1 },
    { productId: ` ${PRODUCT_ID}`, count: 1 },
    { productId: PRODUCT_ID, count: "1" },
    { productId: PRODUCT_ID, count: null },
    { productId: PRODUCT_ID, count: Number.NaN },
    { productId: PRODUCT_ID, count: Number.POSITIVE_INFINITY },
    { productId: PRODUCT_ID, count: 1.5 },
    { productId: PRODUCT_ID, count: 0 },
    { productId: PRODUCT_ID, count: -1 },
    { productId: PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT + 1 },
  ])("rejects the entry %j", (entry) => {
    expect(firstIssue({ labels: [entry] })).toEqual({ field: "labels", message: ENTRY_MESSAGE });
  });

  it("rejects the same product sent twice", () => {
    expect(
      firstIssue({
        labels: [
          { productId: PRODUCT_ID, count: 1 },
          { productId: PRODUCT_ID, count: 2 },
        ],
      }),
    ).toEqual({ field: "labels", message: REPEATED_MESSAGE });
  });

  it("rejects the same product sent twice in different letter cases", () => {
    expect(
      firstIssue({
        labels: [
          { productId: PRODUCT_ID.toUpperCase().replace(/1/g, "A"), count: 1 },
          { productId: PRODUCT_ID.replace(/1/g, "a"), count: 1 },
        ],
      }),
    ).toEqual({ field: "labels", message: REPEATED_MESSAGE });
  });

  it("reports a repeated product met before an invalid entry", () => {
    expect(
      firstIssue({
        labels: [
          { productId: PRODUCT_ID, count: 1 },
          { productId: PRODUCT_ID, count: 1 },
          { productId: "not-a-uuid", count: 1 },
        ],
      }),
    ).toEqual({ field: "labels", message: REPEATED_MESSAGE });
  });

  it("reports an invalid entry met before a repeated product", () => {
    expect(
      firstIssue({
        labels: [
          { productId: "not-a-uuid", count: 1 },
          { productId: PRODUCT_ID, count: 1 },
          { productId: PRODUCT_ID, count: 1 },
        ],
      }),
    ).toEqual({ field: "labels", message: ENTRY_MESSAGE });
  });

  it("reports a repeated product before a total over the limit", () => {
    expect(
      firstIssue({
        labels: [
          { productId: PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: OTHER_PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: THIRD_PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: PRODUCT_ID, count: 1 },
        ],
      }),
    ).toEqual({ field: "labels", message: REPEATED_MESSAGE });
  });

  it("rejects a total one over the limit", () => {
    expect(
      firstIssue({
        labels: [
          { productId: PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          { productId: OTHER_PRODUCT_ID, count: LABELS_MAX_COUNT_PER_PRODUCT },
          {
            productId: THIRD_PRODUCT_ID,
            count: LABELS_MAX_TOTAL_COUNT - LABELS_MAX_COUNT_PER_PRODUCT * 2 + 1,
          },
        ],
      }),
    ).toEqual({ field: "labels", message: TOTAL_MESSAGE });
  });

  it("declares the per-product and total label limits for the screens to read", () => {
    expect(labelSheetBodySchema.shape.labels.meta()).toEqual({
      maxCountPerProduct: LABELS_MAX_COUNT_PER_PRODUCT,
      maxTotalCount: LABELS_MAX_TOTAL_COUNT,
    });
  });

  it("types a request as a list of product ids and counts", () => {
    expectTypeOf<LabelSheetBody>().toEqualTypeOf<{
      labels: { productId: string; count: number }[];
    }>();
  });
});
