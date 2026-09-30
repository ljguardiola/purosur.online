import {
  isBuyerIdentificationThresholdAmount,
  isCalendarDay,
  isNetContentUnit,
  isPullCursor,
  isValidBuyerTaxStatusSet,
  isValidDiscountWeekdays,
  type NetContentUnit,
  PULL_PAGE_MAX_CHANGES,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import { issuerIdentificationSchema } from "../fiscal/issuer-identification.js";
import { discountBenefitSchema } from "../pricing/discount-benefit.js";
import { discountTargetSchema } from "../pricing/discount-target.js";
import { branchSettingsSchema } from "../shared/index.js";

const SINCE_MESSAGE = "since must be the cursor of the last page already pulled, 0 the first time";

export const changesQuerySchema = z.object({
  since: z
    .string({ error: SINCE_MESSAGE })
    .regex(/^(?:0|[1-9][0-9]*)$/, SINCE_MESSAGE)
    .transform(Number)
    .refine(isPullCursor, SINCE_MESSAGE),
});

export type ChangesQuery = z.input<typeof changesQuerySchema>;

const pullCursorSchema = z.int().refine(isPullCursor);

const branchSettingsChangeSchema = z.object({
  change_seq: z.int().positive(),
  entity: z.literal("branch_settings"),
  entity_id: z.string(),
  row: branchSettingsSchema,
});

const pulledChangeShape = {
  change_seq: z.int().positive(),
  entity_id: z.string(),
};

const categoryChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("category"),
  row: z.object({
    name: z.string(),
    parent_id: z.string().nullable(),
    version: z.int(),
  }),
});

const productChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("product"),
  row: z.object({
    name: z.string(),
    category_id: z.string(),
    brand_id: z.string().nullable(),
    sale_unit: z.enum(SALE_UNITS),
    active: z.boolean(),
    net_content: z
      .object({ quantity: z.number(), unit: z.custom<NetContentUnit>(isNetContentUnit) })
      .nullable(),
    barcodes: z.array(z.object({ position: z.int(), code: z.string() })),
    tag_ids: z.array(z.string()),
    version: z.int(),
  }),
});

const tagChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("tag"),
  row: z.object({ name: z.string(), active: z.boolean(), version: z.int() }),
});

const priceListChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("price_list"),
  row: z.object({ name: z.string(), version: z.int() }),
});

const userChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("user"),
  row: z.object({
    first_name: z.string(),
    role_id: z.string(),
    salt: z.string().nullable(),
    pin_hash: z.string().nullable(),
    active: z.boolean(),
    version: z.int(),
  }),
});

const roleChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("role"),
  row: z.object({
    name: z.string().nullable(),
    is_administrator: z.boolean(),
    permission_keys: z.array(z.string()),
    version: z.int(),
  }),
});

const registerChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("register"),
  row: z.object({ name: z.string(), version: z.int() }),
});

const calendarDaySchema = z.string().refine(isCalendarDay);

const discountChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("discount"),
  row: z.object({
    name: z.string(),
    benefit: discountBenefitSchema,
    target: discountTargetSchema,
    valid_from: calendarDaySchema,
    valid_to: calendarDaySchema,
    weekdays: z.array(z.number()).refine(isValidDiscountWeekdays),
    active: z.boolean(),
    version: z.int(),
  }),
});

const issuerIdentificationChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("issuer_identification"),
  row: issuerIdentificationSchema,
});

const buyerIdentificationThresholdChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("buyer_identification_threshold"),
  row: z.object({
    amount: z.int().refine(isBuyerIdentificationThresholdAmount),
    valid_from: calendarDaySchema,
  }),
});

const buyerTaxStatusSetChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("buyer_tax_status_set"),
  row: z.object({
    params_version: z.int().positive(),
    options: z
      .array(z.object({ code: z.int(), description: z.string(), invoice_class: z.string() }))
      .refine((options) =>
        isValidBuyerTaxStatusSet(
          options.map(({ code, description, invoice_class }) => ({
            code,
            description,
            invoiceClass: invoice_class,
          })),
        ),
      ),
  }),
});

const priceChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("price"),
  row: z.object({
    product_id: z.string(),
    price_list_id: z.string(),
    unit_price: z.int(),
    valid_from: z.iso.datetime(),
    version: z.int(),
  }),
});

const removalChangeSchema = z.object({
  ...pulledChangeShape,
  entity: z.literal("removal"),
  removed_entity: z.enum([
    "category",
    "product",
    "tag",
    "price",
    "user",
    "role",
    "register",
    "discount",
  ]),
  version: z.int(),
});

export const changesPageSchema = z.object({
  changes: z
    .array(
      z.discriminatedUnion("entity", [
        branchSettingsChangeSchema,
        categoryChangeSchema,
        productChangeSchema,
        tagChangeSchema,
        priceListChangeSchema,
        priceChangeSchema,
        userChangeSchema,
        roleChangeSchema,
        registerChangeSchema,
        discountChangeSchema,
        issuerIdentificationChangeSchema,
        buyerIdentificationThresholdChangeSchema,
        buyerTaxStatusSetChangeSchema,
        removalChangeSchema,
      ]),
    )
    .max(PULL_PAGE_MAX_CHANGES),
  cursor: pullCursorSchema,
  has_more: z.boolean(),
});

export type ChangesPage = z.output<typeof changesPageSchema>;

export type SyncChange = ChangesPage["changes"][number];
