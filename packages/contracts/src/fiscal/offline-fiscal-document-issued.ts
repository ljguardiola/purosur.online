import {
  FACTURA_C_DOCUMENT_TYPE,
  isCalendarDay,
  OFFLINE_AUTHORIZATION_CAUSES,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const text = z.string().min(1);
const calendarDay = z.string().refine(isCalendarDay);
const cents = z.int().nonnegative();

export const offlineFiscalDocumentIssuedSchema = z.object({
  fiscal_document_id: text,
  sale_id: text,
  register_id: text,
  point_of_sale: pointOfSaleNumberSchema,
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  number: z.int().positive(),
  issued_on: calendarDay,
  generated_at: z.iso.datetime(),
  generation_stamp: z.string().regex(/^\d{14}$/),
  offline_authorization_code: text,
  fortnight_start: calendarDay,
  fortnight_end: calendarDay,
  buyer_document_type: z.int().nonnegative(),
  buyer_document_number: z.int().nonnegative(),
  buyer_tax_status_code: z.int(),
  total: cents,
  net_amount: cents,
  cause: z.enum(OFFLINE_AUTHORIZATION_CAUSES),
});
