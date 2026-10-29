import { isProductNameTooLong, PRODUCT_NAME_MAX_LENGTH } from "@purosur/domain";
import { z } from "zod";

const NAME_EMPTY_MESSAGE = "name must not be empty";

export const productNameSchema = z
  .string({ error: NAME_EMPTY_MESSAGE })
  .trim()
  .min(1, NAME_EMPTY_MESSAGE)
  .refine(
    (name) => !isProductNameTooLong(name),
    `name must be at most ${PRODUCT_NAME_MAX_LENGTH} characters`,
  )
  .meta({ maxLength: PRODUCT_NAME_MAX_LENGTH });
