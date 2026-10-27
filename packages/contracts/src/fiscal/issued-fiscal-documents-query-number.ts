import { z } from "zod";

export const issuedFiscalDocumentsQueryNumberSchema = z
  .string()
  .regex(/^[1-9]\d{0,8}$/)
  .transform(Number);
