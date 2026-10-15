import { FACTURA_C_DOCUMENT_TYPE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema, requestIdSchema } from "../shared/index.js";

const requestId = requestIdSchema;

const readClockGuardMessageSchema = z.object({
  type: z.literal("read-clock-guard"),
  request_id: requestId,
});

const correctRegisterClockMessageSchema = z.object({
  type: z.literal("correct-register-clock"),
  request_id: requestId,
});

export const fiscalRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  readClockGuardMessageSchema,
  correctRegisterClockMessageSchema,
]);
export type FiscalRendererToCoreMessage = z.infer<typeof fiscalRendererToCoreMessageSchema>;

const unavailableOutcome = z.object({ kind: z.literal("unavailable") });

const documentTypeSchema = z.literal(FACTURA_C_DOCUMENT_TYPE);

const readClockGuardOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("read"),
    reading: z.iso.datetime(),
    blocks: z.array(
      z.object({
        point_of_sale: pointOfSaleNumberSchema,
        document_type: documentTypeSchema,
        latest_reading: z.iso.datetime().nullable(),
        tax_authority_last_authorized_issued_on: z.string().nullable(),
      }),
    ),
    may_correct: z.boolean(),
    correction_available: z.boolean(),
  }),
  unavailableOutcome,
]);
export type ReadClockGuardOutcome = z.infer<typeof readClockGuardOutcomeSchema>;

const correctRegisterClockOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("corrected"),
    lowerings: z
      .array(
        z.object({
          point_of_sale: pointOfSaleNumberSchema,
          document_type: documentTypeSchema,
          previous_reading: z.iso.datetime(),
          corrected_reading: z.iso.datetime(),
        }),
      )
      .min(1),
  }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_behind") }),
  z.object({ kind: z.literal("already_corrected_in_period") }),
  unavailableOutcome,
]);
export type CorrectRegisterClockOutcome = z.infer<typeof correctRegisterClockOutcomeSchema>;

export const fiscalCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("read-clock-guard-result"),
    request_id: requestId,
    outcome: readClockGuardOutcomeSchema,
  }),
  z.object({
    type: z.literal("correct-register-clock-result"),
    request_id: requestId,
    outcome: correctRegisterClockOutcomeSchema,
  }),
]);
export type FiscalCoreToRendererMessage = z.infer<typeof fiscalCoreToRendererMessageSchema>;
