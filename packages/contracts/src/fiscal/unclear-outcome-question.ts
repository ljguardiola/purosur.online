import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import {
  authorizedResponseSchema,
  realTimeAuthorizationRequestSchema,
  rejectedResponseSchema,
} from "./real-time-authorization.js";

export const unclearOutcomeQuestionSchema = realTimeAuthorizationRequestSchema.omit({
  timeout_ms: true,
  rtt_median_ms: true,
});

export type UnclearOutcomeQuestionBody = z.output<typeof unclearOutcomeQuestionSchema>;

export const unclearOutcomeAnswerSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("PENDING") }),
  z.object({ state: z.literal("RELEASED") }),
  z.object({
    state: z.literal("ADOPTED"),
    authorization_code: z.string().min(1),
    authorization_code_due_on: z.string().refine(isCalendarDay),
  }),
  z.object({ state: z.literal("CONFLICTING") }),
  authorizedResponseSchema,
  rejectedResponseSchema,
]);

export type UnclearOutcomeAnswerBody = z.output<typeof unclearOutcomeAnswerSchema>;
