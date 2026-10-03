import { isPointOfSaleNumber, POINT_OF_SALE_NUMBER_MAX } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const NUMBER_MESSAGE = `point_of_sale_number must be an integer from 1 to ${POINT_OF_SALE_NUMBER_MAX}`;
const FISCAL_ADDRESS_MESSAGE = "fiscal_address_id must be the id of a fiscal address";
const VERSION_MESSAGE = "version must be the non-negative integer it was loaded with";

export const pointOfSaleConfigurationBodySchema = z.object({
  point_of_sale_number: z
    .number({ error: NUMBER_MESSAGE })
    .refine(isPointOfSaleNumber, NUMBER_MESSAGE),
  fiscal_address_id: recordIdSchema(FISCAL_ADDRESS_MESSAGE),
  version: z.number({ error: VERSION_MESSAGE }).int(VERSION_MESSAGE).min(0, VERSION_MESSAGE),
});

export type PointOfSaleConfigurationBody = z.input<typeof pointOfSaleConfigurationBodySchema>;
