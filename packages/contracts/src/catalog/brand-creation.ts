import { BRAND_NAME_MAX_LENGTH, isBrandNameTooLong } from "@purosur/domain";
import { z } from "zod";

const NAME_EMPTY_MESSAGE = "name must not be empty";

export const brandCreationBodySchema = z.object({
  name: z
    .string({ error: NAME_EMPTY_MESSAGE })
    .trim()
    .min(1, NAME_EMPTY_MESSAGE)
    .refine(
      (name) => !isBrandNameTooLong(name),
      `name must be at most ${BRAND_NAME_MAX_LENGTH} characters`,
    )
    .meta({ maxLength: BRAND_NAME_MAX_LENGTH }),
});

export type BrandCreationBody = z.input<typeof brandCreationBodySchema>;
