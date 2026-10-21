import { FACTURA_C_VOUCHER_TYPE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "./point-of-sale-number.js";

export const voidCreditNoteSchema = z.object({
  id: z.string().min(1),
  total: z.int().positive(),
  receiver_tax_status_code: z.int(),
  corrects: z.object({
    voucher_type: z.literal(FACTURA_C_VOUCHER_TYPE),
    point_of_sale: pointOfSaleNumberSchema,
    number: z.int().positive(),
  }),
});
