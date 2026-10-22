import { isCalendarDay, REPLENISHMENT_PAGE_MAX_EVENTS } from "@purosur/domain";
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
  z.object({ state: z.literal("ALREADY_CREDITED") }).extend(creditNoteAnswerFields),
]);

const unclearDeferralFields = { fiscal_document_id: recordIdSchema() };

const registerResetUnclearDeferralSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("UNSETTLED"), ...unclearDeferralFields }),
  z.object({
    state: z.literal("REJECTED"),
    ...unclearDeferralFields,
    answered_at: z.iso.datetime(),
  }),
  z.object({
    state: z.literal("AUTHORIZED"),
    ...unclearDeferralFields,
    authorization_code: z.string().min(1),
    authorization_code_due_on: z.string().refine(isCalendarDay),
    answered_at: z.iso.datetime(),
  }),
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
  unrequested_credit_note_ids: z.array(recordIdSchema()),
  unclear_deferrals: z.array(registerResetUnclearDeferralSchema),
});

export type RegisterResetRequest = z.output<typeof registerResetRequestSchema>;
export type RegisterResetResponse = z.output<typeof registerResetResponseSchema>;
