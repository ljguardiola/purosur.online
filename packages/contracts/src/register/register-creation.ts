import { isRegisterNameTooLong } from "@purosur/domain";
import { z } from "zod";

export const registerCreationBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name must not be empty")
    .refine((name) => !isRegisterNameTooLong(name), "name is too long"),
});

export type RegisterCreationBody = z.input<typeof registerCreationBodySchema>;
