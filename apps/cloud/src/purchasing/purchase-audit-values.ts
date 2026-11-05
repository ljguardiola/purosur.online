import { RECEIPT_TYPES } from "@purosur/domain";
import type {
  PurchaseCorrectionChange,
  PurchaseHeaderChange,
} from "@purosur/domain/purchasing/use-cases";
import { z } from "zod";

export const PURCHASE_AUDIT_ENTITY = "purchase";

const addedLineSchema = z.object({
  lineId: z.string(),
  productId: z.string(),
  quantity: z.int(),
  costPaidCents: z.int(),
  expiresOn: z.string().nullable(),
});

const headerFieldsSchema = z
  .object({
    purchasedOn: z.string(),
    receiptType: z.enum(RECEIPT_TYPES),
    receiptNumber: z.string().nullable(),
    note: z.string().nullable(),
  })
  .partial();

const HEADER_FIELDS = ["purchasedOn", "receiptType", "receiptNumber", "note"] as const;

const headerSchema = z.object({ kind: z.literal("header"), fields: headerFieldsSchema });
const linesAddedSchema = z.object({
  kind: z.literal("lines_added"),
  lines: z.array(addedLineSchema),
});
const lineExpirySchema = z.object({
  kind: z.literal("line_expiry"),
  lineId: z.string(),
  expiresOn: z.string().nullable(),
});

const lineExpirySplitSchema = z.object({
  kind: z.literal("line_expiry_split"),
  lineId: z.string(),
  quantity: z.int(),
  expiresOn: z.string().nullable(),
});

const lineCostSchema = z.object({
  kind: z.literal("line_cost"),
  lineId: z.string(),
  costPaidCents: z.int(),
});

const lineQuantitySchema = z.object({
  kind: z.literal("line_quantity"),
  lineId: z.string(),
  quantity: z.int(),
  packages: z.int().nullable(),
});

interface AuditValues {
  previousValue: unknown;
  newValue: unknown;
}

export function auditValuesOf(change: PurchaseCorrectionChange): AuditValues {
  switch (change.kind) {
    case "header":
      return {
        previousValue: {
          kind: "header",
          fields: Object.fromEntries(change.changes.map((c) => [c.field, c.previous])),
        },
        newValue: {
          kind: "header",
          fields: Object.fromEntries(change.changes.map((c) => [c.field, c.next])),
        },
      };
    case "lines_added":
      return { previousValue: null, newValue: { kind: "lines_added", lines: change.lines } };
    case "line_expiry":
      return {
        previousValue: { kind: "line_expiry", lineId: change.lineId, expiresOn: change.previous },
        newValue: { kind: "line_expiry", lineId: change.lineId, expiresOn: change.next },
      };
    case "line_expiry_split":
      return {
        previousValue: {
          kind: "line_expiry_split",
          lineId: change.lineId,
          quantity: change.quantity,
          expiresOn: change.previous,
        },
        newValue: {
          kind: "line_expiry_split",
          lineId: change.lineId,
          quantity: change.quantity,
          expiresOn: change.next,
        },
      };
    case "line_cost":
      return {
        previousValue: { kind: "line_cost", lineId: change.lineId, costPaidCents: change.previous },
        newValue: { kind: "line_cost", lineId: change.lineId, costPaidCents: change.next },
      };
    case "line_quantity":
      return {
        previousValue: { kind: "line_quantity", lineId: change.lineId, ...change.previous },
        newValue: { kind: "line_quantity", lineId: change.lineId, ...change.next },
      };
  }
}

export function changeOfAuditValues(
  previousValue: unknown,
  newValue: unknown,
): PurchaseCorrectionChange {
  const added = linesAddedSchema.safeParse(newValue);
  if (added.success) {
    return { kind: "lines_added", lines: added.data.lines };
  }
  const header = headerSchema.safeParse(newValue);
  if (header.success) {
    const previous = headerSchema.parse(previousValue).fields;
    const changes = HEADER_FIELDS.flatMap((field): PurchaseHeaderChange[] =>
      field in header.data.fields
        ? ([
            { field, previous: previous[field], next: header.data.fields[field] },
          ] as PurchaseHeaderChange[])
        : [],
    );
    return { kind: "header", changes };
  }
  const cost = lineCostSchema.safeParse(newValue);
  if (cost.success) {
    return {
      kind: "line_cost",
      lineId: cost.data.lineId,
      previous: lineCostSchema.parse(previousValue).costPaidCents,
      next: cost.data.costPaidCents,
    };
  }
  const quantity = lineQuantitySchema.safeParse(newValue);
  if (quantity.success) {
    const { lineId, ...next } = quantity.data;
    const { lineId: _lineId, ...previous } = lineQuantitySchema.parse(previousValue);
    return {
      kind: "line_quantity",
      lineId,
      previous: { quantity: previous.quantity, packages: previous.packages },
      next: { quantity: next.quantity, packages: next.packages },
    };
  }
  const split = lineExpirySplitSchema.safeParse(newValue);
  if (split.success) {
    return {
      kind: "line_expiry_split",
      lineId: split.data.lineId,
      quantity: split.data.quantity,
      previous: lineExpirySplitSchema.parse(previousValue).expiresOn,
      next: split.data.expiresOn,
    };
  }
  const next = lineExpirySchema.parse(newValue);
  return {
    kind: "line_expiry",
    lineId: next.lineId,
    previous: lineExpirySchema.parse(previousValue).expiresOn,
    next: next.expiresOn,
  };
}
