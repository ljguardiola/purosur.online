import {
  isSupplierPriceListWebPageAddressTooLong,
  isSupplierPriceListWebPageScheme,
  SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema, requiredTextSchema } from "../shared/index.js";

function isWebPageAddress(value: string): boolean {
  return (
    URL.canParse(value) && isSupplierPriceListWebPageScheme(new URL(value).protocol.slice(0, -1))
  );
}

export const supplierPriceListWebPageBodySchema = z.object({
  supplierId: recordIdSchema("supplierId must be a supplier's id"),
  url: requiredTextSchema(
    "url",
    SUPPLIER_PRICE_LIST_WEB_PAGE_ADDRESS_MAX_LENGTH,
    isSupplierPriceListWebPageAddressTooLong,
  ).refine(isWebPageAddress, "url must be a web address starting with http:// or https://"),
});

export type SupplierPriceListWebPageBody = z.input<typeof supplierPriceListWebPageBodySchema>;
