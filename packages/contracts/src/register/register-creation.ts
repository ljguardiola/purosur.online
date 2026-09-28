import { isRegisterNameTooLong, REGISTER_NAME_MAX_LENGTH } from "@purosur/domain";
import { z } from "zod";

const EMPTY_NAME_MESSAGE = "name must not be empty";

export const registerCreationBodySchema = z.object({
  name: z
    .string({ error: EMPTY_NAME_MESSAGE })
    .trim()
    .min(1, EMPTY_NAME_MESSAGE)
    .refine(
      (name) => !isRegisterNameTooLong(name),
      `name must be at most ${REGISTER_NAME_MAX_LENGTH} characters`,
    ),
});

export type RegisterCreationBody = z.input<typeof registerCreationBodySchema>;
