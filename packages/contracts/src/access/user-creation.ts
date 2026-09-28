import { z } from "zod";
import { emailAddressSchema } from "./email-address.js";

export const userCreationBodySchema = z.object({
  first_name: z
    .string({ error: "first_name must not be empty" })
    .trim()
    .min(1, "first_name must not be empty"),
  email: emailAddressSchema,
  role_id: z.guid({ error: "role_id must be a role's id" }),
});

export type UserCreationBody = z.input<typeof userCreationBodySchema>;
