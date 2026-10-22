import {
  CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS,
  CONTINGENCY_BACKUP_TICKET_STANDINGS,
} from "@purosur/domain";
import { z } from "zod";

export const contingencyBackupTicketsAnswerSchema = z.object({
  to_print: z.int().nonnegative(),
  awaiting_customer_document: z.int().nonnegative(),
  missing_key: z.int().nonnegative(),
  kept: z.int().nonnegative(),
  discardable: z.int().nonnegative(),
  may_discard: z.boolean(),
  printer: z.enum(CONTINGENCY_BACKUP_PRINT_FAILURE_REASONS).nullable(),
});

export type ContingencyBackupTicketsAnswer = z.output<typeof contingencyBackupTicketsAnswerSchema>;

export const contingencyBackupTicketOfSaleAnswerSchema = z.object({
  standing: z.enum(CONTINGENCY_BACKUP_TICKET_STANDINGS).nullable(),
});

export type ContingencyBackupTicketOfSaleAnswer = z.output<
  typeof contingencyBackupTicketOfSaleAnswerSchema
>;

export const discardContingencyBackupTicketsOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("discarded"), count: z.int().nonnegative() }),
  z.object({ kind: z.literal("not_yet") }),
]);

export type DiscardContingencyBackupTicketsOutcome = z.output<
  typeof discardContingencyBackupTicketsOutcomeSchema
>;
