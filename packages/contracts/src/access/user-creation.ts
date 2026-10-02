import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { emailAddressSchema } from "./email-address.js";

export const userCreationBodySchema = z.object({
  first_name: z.string({ error: "first_name must not be empty" }).trim().min(1),
  email: emailAddressSchema,
  role_id: recordIdSchema("role_id must be a role's id"),
});

export type UserCreationBody = z.input<typeof userCreationBodySchema>;
