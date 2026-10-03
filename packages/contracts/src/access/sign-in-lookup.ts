import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { emailAddressSchema } from "./email-address.js";

export const signInLookupBodySchema = z.object({
  email: emailAddressSchema,
});

export type SignInLookupBody = z.input<typeof signInLookupBodySchema>;

export const signInLookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("found"), user_id: recordIdSchema(), has_pin: z.boolean() }),
  z.object({ kind: z.literal("not_found") }),
]);

export type SignInLookup = z.output<typeof signInLookupSchema>;
