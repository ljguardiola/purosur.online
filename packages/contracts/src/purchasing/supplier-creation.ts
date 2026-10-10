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
import { optionalTextSchema } from "./optional-text.js";

function optionalLimitedTextSchema(
  field: string,
  maxLength: number,
  isTooLong: (value: string) => boolean,
) {
  return optionalTextSchema(
    `${field} must be a string of at most ${maxLength} characters`,
    (value) => !isTooLong(value),
  ).meta({ maxLength });
}

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
