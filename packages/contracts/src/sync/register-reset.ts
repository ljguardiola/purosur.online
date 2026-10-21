import { REPLENISHMENT_PAGE_MAX_EVENTS } from "@purosur/domain";
import { z } from "zod";
import {
  authorizedVoidCreditNoteAnswerSchema,
  pushedEventSchema,
  recordIdSchema,
  rejectedVoidCreditNoteAnswerSchema,
} from "../shared/index.js";
import { userRowSchema } from "./changes.js";

const eventPositionSchema = z.object({
  device_id: recordIdSchema(),
  device_seq: z.int().positive(),
});

const creditNoteAnswerFields = {
  credit_note_id: recordIdSchema(),
  answered_at: z.iso.datetime(),
};

const registerResetCreditNoteSchema = z.discriminatedUnion("state", [
  authorizedVoidCreditNoteAnswerSchema.extend(creditNoteAnswerFields),
  rejectedVoidCreditNoteAnswerSchema.extend(creditNoteAnswerFields),
]);

export const registerResetRequestSchema = z.object({
  predecessor_device_id: recordIdSchema(),
  last_acknowledged_seq: z.int().nonnegative(),
  after: eventPositionSchema.optional(),
});

export const registerResetResponseSchema = z.object({
  events: z
    .array(pushedEventSchema.extend({ device_id: recordIdSchema() }))
    .max(REPLENISHMENT_PAGE_MAX_EVENTS),
  next: eventPositionSchema.nullable(),
  users: z.array(userRowSchema.extend({ user_id: recordIdSchema() })),
  credit_notes: z.array(registerResetCreditNoteSchema),
});

export type RegisterResetRequest = z.output<typeof registerResetRequestSchema>;
export type RegisterResetResponse = z.output<typeof registerResetResponseSchema>;
