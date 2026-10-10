import {
  isSupplierContactTooLong,
  isSupplierNameTooLong,
  isSupplierNoteTooLong,
  isValidCuit,
  SUPPLIER_CONTACT_MAX_LENGTH,
  SUPPLIER_NAME_MAX_LENGTH,
  SUPPLIER_NOTE_MAX_LENGTH,
} from "@purosur/domain";
import { z } from "zod";
import { requiredTextSchema } from "../shared/index.js";
import { optionalLimitedTextSchema, optionalTextSchema } from "./optional-text.js";

export const supplierCreationBodySchema = z.object({
  name: requiredTextSchema("name", SUPPLIER_NAME_MAX_LENGTH, isSupplierNameTooLong),
  cuit: optionalTextSchema("cuit must be a valid CUIT in the form NN-NNNNNNNN-N", isValidCuit),
  contact: optionalLimitedTextSchema(
    "contact",
    SUPPLIER_CONTACT_MAX_LENGTH,
    isSupplierContactTooLong,
  ),
  note: optionalLimitedTextSchema("note", SUPPLIER_NOTE_MAX_LENGTH, isSupplierNoteTooLong),
});

export type SupplierCreationBody = z.input<typeof supplierCreationBodySchema>;
