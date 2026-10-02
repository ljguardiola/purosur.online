import { PIN_SIGN_IN_LOCKOUT_FAILURES, PIN_SIGN_IN_MAX_DELAY_SECONDS } from "@purosur/domain";
import { z } from "zod";

const pinSignInWaitSeconds = z.int().max(PIN_SIGN_IN_MAX_DELAY_SECONDS);
const pinSignInAttemptsLeft = z
  .int()
  .min(1)
  .max(PIN_SIGN_IN_LOCKOUT_FAILURES - 1);

export const pinAttemptRefusalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("wrong_pin"),
    retry_after_seconds: pinSignInWaitSeconds.min(0),
    attempts_left: pinSignInAttemptsLeft,
  }),
  z.object({
    kind: z.literal("rate_limited"),
    retry_after_seconds: pinSignInWaitSeconds.min(1),
    attempts_left: pinSignInAttemptsLeft,
  }),
  z.object({
    kind: z.literal("locked"),
    consecutive_failures: z.literal(PIN_SIGN_IN_LOCKOUT_FAILURES),
  }),
]);
export type PinAttemptRefusal = z.infer<typeof pinAttemptRefusalSchema>;
