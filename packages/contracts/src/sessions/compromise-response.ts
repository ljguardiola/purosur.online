import { COMPROMISE_RESPONSE_ITEMS, COMPROMISE_RESPONSE_STEPS } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const stepSchema = z.enum(COMPROMISE_RESPONSE_STEPS);

export const compromiseResponseItemSchema = z.enum(COMPROMISE_RESPONSE_ITEMS);

export const compromiseResponseSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  started_by: z.string(),
  completed: z.boolean(),
  steps: z.array(
    z.object({
      step: stepSchema,
      done: z.boolean(),
      done_at: z.string().nullable(),
      available: z.boolean(),
    }),
  ),
  items: z.array(
    z.object({
      item: compromiseResponseItemSchema,
      step: stepSchema,
      done: z.boolean(),
      done_at: z.string().nullable(),
    }),
  ),
});

export type CompromiseResponseBody = z.output<typeof compromiseResponseSchema>;

export const compromiseResponseSessionsAndPasskeysBodySchema = z.object({
  account_id: recordIdSchema("account_id must be a user's id"),
});

export type CompromiseResponseSessionsAndPasskeysBody = z.input<
  typeof compromiseResponseSessionsAndPasskeysBodySchema
>;
