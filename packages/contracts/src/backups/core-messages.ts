import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";
import {
  contingencyBackupTicketOfSaleAnswerSchema,
  contingencyBackupTicketsAnswerSchema,
  discardContingencyBackupTicketsOutcomeSchema,
} from "./contingency-backup-ticket-answers.js";

const requestId = requestIdSchema;

export const backupsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("read-contingency-backup-tickets"), request_id: requestId }),
  z.object({
    type: z.literal("read-contingency-backup-ticket-of-sale"),
    request_id: requestId,
    sale_id: z.string(),
  }),
  z.object({ type: z.literal("discard-contingency-backup-tickets"), request_id: requestId }),
]);
export type BackupsRendererToCoreMessage = z.infer<typeof backupsRendererToCoreMessageSchema>;

const unavailableOutcome = z.object({ kind: z.literal("unavailable") });
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });

const readContingencyBackupTicketsOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), tickets: contingencyBackupTicketsAnswerSchema }),
  notSignedInOutcome,
  unavailableOutcome,
]);
export type ReadContingencyBackupTicketsOutcome = z.infer<
  typeof readContingencyBackupTicketsOutcomeSchema
>;

const readContingencyBackupTicketOfSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("read"), ticket: contingencyBackupTicketOfSaleAnswerSchema }),
  notSignedInOutcome,
  unavailableOutcome,
]);
export type ReadContingencyBackupTicketOfSaleOutcome = z.infer<
  typeof readContingencyBackupTicketOfSaleOutcomeSchema
>;

const discardContingencyBackupTicketsAnswerSchema = z.discriminatedUnion("kind", [
  ...discardContingencyBackupTicketsOutcomeSchema.options,
  notSignedInOutcome,
  z.object({ kind: z.literal("lacks_permission") }),
  unavailableOutcome,
]);
export type DiscardContingencyBackupTicketsAnswer = z.infer<
  typeof discardContingencyBackupTicketsAnswerSchema
>;

export const backupsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("read-contingency-backup-tickets-result"),
    request_id: requestId,
    outcome: readContingencyBackupTicketsOutcomeSchema,
  }),
  z.object({
    type: z.literal("read-contingency-backup-ticket-of-sale-result"),
    request_id: requestId,
    outcome: readContingencyBackupTicketOfSaleOutcomeSchema,
  }),
  z.object({
    type: z.literal("discard-contingency-backup-tickets-result"),
    request_id: requestId,
    outcome: discardContingencyBackupTicketsAnswerSchema,
  }),
]);
export type BackupsCoreToRendererMessage = z.infer<typeof backupsCoreToRendererMessageSchema>;
