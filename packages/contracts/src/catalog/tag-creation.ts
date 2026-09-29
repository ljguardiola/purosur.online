import { isTagNameTooLong, TAG_NAME_MAX_LENGTH } from "@purosur/domain";
import { z } from "zod";

const NAME_EMPTY_MESSAGE = "name must not be empty";

export const tagCreationBodySchema = z.object({
  name: z
    .string({ error: NAME_EMPTY_MESSAGE })
    .trim()
    .min(1, NAME_EMPTY_MESSAGE)
    .refine(
      (name) => !isTagNameTooLong(name),
      `name must be at most ${TAG_NAME_MAX_LENGTH} characters`,
    ),
});

export type TagCreationBody = z.input<typeof tagCreationBodySchema>;
