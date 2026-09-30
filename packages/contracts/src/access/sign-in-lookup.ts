import { z } from "zod";
import { emailAddressSchema } from "./email-address.js";

export const signInLookupBodySchema = z.object({
  email: emailAddressSchema,
});

export type SignInLookupBody = z.input<typeof signInLookupBodySchema>;

export const signInLookupSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("found"), user_id: z.uuid(), has_pin: z.boolean() }),
  z.object({ kind: z.literal("not_found") }),
]);

export type SignInLookup = z.output<typeof signInLookupSchema>;
