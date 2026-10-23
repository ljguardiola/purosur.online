import { CONTINGENCY_BACKUP_OPERATIONS, OFFLINE_SERIES_DOCUMENT_TYPES } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const MAX_QR_CODES_PER_TICKET = 255;
const MAX_QR_CODE_LENGTH = 1000;

export const contingencyBackupTicketRescueRequestSchema = z.object({
  qr_codes: z.array(z.string().min(1).max(MAX_QR_CODE_LENGTH)).min(1).max(MAX_QR_CODES_PER_TICKET),
});

export type ContingencyBackupTicketRescueRequest = z.output<
  typeof contingencyBackupTicketRescueRequestSchema
>;

const rescuedTicketSummarySchema = z.object({
  operation: z.enum(CONTINGENCY_BACKUP_OPERATIONS).nullable(),
  occurred_at: z.iso.datetime().nullable(),
  vouchers: z.array(
    z.object({
      point_of_sale: z.int().positive(),
      document_type: z.enum(OFFLINE_SERIES_DOCUMENT_TYPES),
      number: z.int().positive(),
    }),
  ),
  sale_total: z.int().nonnegative().nullable(),
});

export const contingencyBackupTicketRescueResponseSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("rescued"),
    register_id: recordIdSchema(),
    register_name: z.string().min(1),
    received: z.int().nonnegative(),
    already_received: z.int().nonnegative(),
    summary: rescuedTicketSummarySchema,
  }),
  z.object({ outcome: z.literal("unreadable") }),
  z.object({ outcome: z.literal("incomplete") }),
  z.object({ outcome: z.literal("unknown_key") }),
  z.object({ outcome: z.literal("not_authentic") }),
  z.object({ outcome: z.literal("foreign_installation") }),
  z.object({ outcome: z.literal("conflicting") }),
]);

export type ContingencyBackupTicketRescueResponse = z.output<
  typeof contingencyBackupTicketRescueResponseSchema
>;
