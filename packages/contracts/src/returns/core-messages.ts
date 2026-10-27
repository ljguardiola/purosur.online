import { ticketReferenceFromQrText } from "@purosur/domain";
import { z } from "zod";
import { authorizationSchema, pointOfSaleNumberSchema, requestIdSchema } from "../shared/index.js";
import {
  completeReturnOutcomeSchema,
  findSaleForReturnOutcomeSchema,
  previewReturnOutcomeSchema,
  refundAllocationSchema,
  returnDraftLineSchema,
  ticketSourceSchema,
} from "./return.js";

const QR_MESSAGE = "text must be the QR of a sale's ticket";

const typedReadingSchema = z
  .object({
    kind: z.literal("typed"),
    point_of_sale: pointOfSaleNumberSchema,
    number: z.int().positive(),
  })
  .transform(({ point_of_sale: pointOfSale, number }) => ({
    source: "TYPED" as const,
    ticket: { kind: "invoice" as const, pointOfSale, number },
  }));

const scannedReadingSchema = z
  .object({
    kind: z.literal("scanned"),
    text: z.string({ error: QR_MESSAGE }).transform((text, context) => {
      const ticket = ticketReferenceFromQrText(text);
      if (ticket === null) {
        context.addIssue({ code: "custom", message: QR_MESSAGE });
        return z.NEVER;
      }
      return ticket;
    }),
  })
  .transform(({ text }) => ({ source: "QR" as const, ticket: text }));

export const findSaleForReturnMessageSchema = z.object({
  type: z.literal("find-sale-for-return"),
  request_id: requestIdSchema,
  reading: z.union([typedReadingSchema, scannedReadingSchema]),
  authorization: authorizationSchema.optional(),
});

const previewReturnMessageSchema = z.object({
  type: z.literal("preview-return"),
  request_id: requestIdSchema,
  sale_id: z.string(),
  lines: z.array(returnDraftLineSchema),
});

export const completeReturnMessageSchema = z.object({
  type: z.literal("complete-return"),
  request_id: requestIdSchema,
  sale_id: z.string(),
  ticket_source: ticketSourceSchema,
  lines: z.array(returnDraftLineSchema),
  refunds: z.array(refundAllocationSchema),
  authorization: authorizationSchema.optional(),
});

export const returnsRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  findSaleForReturnMessageSchema,
  previewReturnMessageSchema,
  completeReturnMessageSchema,
]);
export type ReturnsRendererToCoreMessage = z.infer<typeof returnsRendererToCoreMessageSchema>;

export const returnsCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("find-sale-for-return-result"),
    request_id: requestIdSchema,
    outcome: findSaleForReturnOutcomeSchema,
  }),
  z.object({
    type: z.literal("preview-return-result"),
    request_id: requestIdSchema,
    outcome: previewReturnOutcomeSchema,
  }),
  z.object({
    type: z.literal("complete-return-result"),
    request_id: requestIdSchema,
    outcome: completeReturnOutcomeSchema,
  }),
]);
export type ReturnsCoreToRendererMessage = z.infer<typeof returnsCoreToRendererMessageSchema>;
