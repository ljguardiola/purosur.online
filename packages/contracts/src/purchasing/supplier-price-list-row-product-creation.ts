import { newProductBarcodeListProblem, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import {
  barcodeListSchema,
  checkNetContentQuantity,
  loadedVersionSchema,
  NET_CONTENT_QUANTITY_CHECK_OPTIONS,
  optionalBrandIdSchema,
  optionalTagIdsSchema,
  productNameSchema,
  productNetContentSchema,
  recordIdSchema,
} from "../shared/index.js";
import {
  supplierItemQuantitySchema,
  supplierItemVatRateSchema,
} from "./supplier-price-list-row-link.js";

export const supplierPriceListRowProductCreationBodySchema = z
  .object({
    version: loadedVersionSchema,
    name: productNameSchema,
    categoryId: recordIdSchema("categoryId must be an existing category's id"),
    brandId: optionalBrandIdSchema,
    saleUnit: z.enum(SALE_UNITS, { error: "saleUnit must be UNIT or KG" }),
    barcodes: barcodeListSchema(newProductBarcodeListProblem),
    tagIds: optionalTagIdsSchema,
    netContent: productNetContentSchema,
    quantity: supplierItemQuantitySchema,
    vatRate: supplierItemVatRateSchema,
  })
  .superRefine(checkNetContentQuantity, NET_CONTENT_QUANTITY_CHECK_OPTIONS);

export type SupplierPriceListRowProductCreationBody = z.input<
  typeof supplierPriceListRowProductCreationBodySchema
>;

export const supplierPriceListRowProductCreatedSchema = z.object({
  productId: z.string(),
});

export type SupplierPriceListRowProductCreated = z.output<
  typeof supplierPriceListRowProductCreatedSchema
>;
