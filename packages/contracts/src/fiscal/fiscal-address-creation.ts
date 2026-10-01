import {
  FISCAL_ADDRESS_NAME_MAX_LENGTH,
  FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
  isFiscalAddressNameTooLong,
  isFiscalAddressStreetAddressTooLong,
} from "@purosur/domain";
import { z } from "zod";
import { requiredTextSchema } from "../shared/index.js";

export const fiscalAddressCreationBodySchema = z.object({
  name: requiredTextSchema("name", FISCAL_ADDRESS_NAME_MAX_LENGTH, isFiscalAddressNameTooLong),
  street_address: requiredTextSchema(
    "street_address",
    FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
    isFiscalAddressStreetAddressTooLong,
  ),
});

export type FiscalAddressCreationBody = z.input<typeof fiscalAddressCreationBodySchema>;
