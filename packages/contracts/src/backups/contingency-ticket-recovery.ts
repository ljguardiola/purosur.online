import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const contingencyTicketRecoveryRequestSchema = z.object({
  predecessor_device_id: recordIdSchema(),
});

export type ContingencyTicketRecoveryRequest = z.output<
  typeof contingencyTicketRecoveryRequestSchema
>;

export const contingencyTicketRecoveryAnswerSchema = z.object({
  status: z.enum(["awaiting", "finished"]),
});

export type ContingencyTicketRecoveryAnswer = z.output<
  typeof contingencyTicketRecoveryAnswerSchema
>;

export const contingencyTicketRecoveriesResponseSchema = z.object({
  recoveries: z.array(
    z.object({
      recovery_id: recordIdSchema(),
      register_id: recordIdSchema(),
      register_name: z.string().min(1),
      opened_at: z.iso.datetime(),
    }),
  ),
});

export type ContingencyTicketRecoveriesResponse = z.output<
  typeof contingencyTicketRecoveriesResponseSchema
>;

export const contingencyTicketRecoveryFinishResponseSchema = z.object({
  outcome: z.enum(["finished", "already_finished", "not_found"]),
});

export type ContingencyTicketRecoveryFinishResponse = z.output<
  typeof contingencyTicketRecoveryFinishResponseSchema
>;
