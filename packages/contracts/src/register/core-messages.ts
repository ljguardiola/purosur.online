import {
  type AuthorizablePermissionKey,
  CASH_MOVEMENT_DIRECTIONS,
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_TYPES,
  isAuthorizablePermissionKey,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizationSchema,
  authorizedBySchema,
  openCashSessionSchema,
  requestIdSchema,
  signInUserSchema,
} from "../shared/index.js";

const requestId = requestIdSchema;

const rendererPingMessageSchema = z.object({
  type: z.literal("ping"),
});

const enrollmentStatusRequestMessageSchema = z.object({
  type: z.literal("enrollment-status-request"),
  request_id: requestId,
});

const registerServiceRequestMessageSchema = z.object({
  type: z.literal("register-service-request"),
  request_id: requestId,
});

const registerNameRequestMessageSchema = z.object({
  type: z.literal("register-name-request"),
  request_id: requestId,
});

export const enrollMessageSchema = z.object({
  type: z.literal("enroll"),
  request_id: requestId,
  code: z.string(),
});

const checkEnrollmentCodeMessageSchema = z.object({
  type: z.literal("check-enrollment-code"),
  request_id: requestId,
  code: z.string(),
});

export const openCashSessionMessageSchema = z.object({
  type: z.literal("open-cash-session"),
  request_id: requestId,
  opening_float: z.int(),
});

const cashSessionRequestMessageSchema = z.object({
  type: z.literal("cash-session-request"),
  request_id: requestId,
});

export const recordCashMovementMessageSchema = z.object({
  type: z.literal("record-cash-movement"),
  request_id: requestId,
  kind: z.enum(CASH_MOVEMENT_KINDS),
  amount: z.int(),
  reason: z.string(),
  authorization: authorizationSchema.optional(),
});
export type RecordCashMovementRequest = Omit<
  z.infer<typeof recordCashMovementMessageSchema>,
  "type" | "request_id"
>;

const cashMovementsRequestMessageSchema = z.object({
  type: z.literal("cash-movements-request"),
  request_id: requestId,
});

const cashMovementKindsRequestMessageSchema = z.object({
  type: z.literal("cash-movement-kinds-request"),
  request_id: requestId,
});

export const closeCashSessionMessageSchema = z.object({
  type: z.literal("close-cash-session"),
  request_id: requestId,
  session_id: z.string(),
  counted_cash: z.int(),
});

export const closeLockedCashSessionMessageSchema = z.object({
  type: z.literal("close-locked-cash-session"),
  request_id: requestId,
  session_id: z.string(),
  counted_cash: z.int(),
  closer: authorizationSchema,
});

const identifyLockedCloserMessageSchema = z.object({
  type: z.literal("identify-locked-closer"),
  request_id: requestId,
  closer: authorizationSchema,
});

const cashBalanceRequestMessageSchema = z.object({
  type: z.literal("cash-balance-request"),
  request_id: requestId,
});

const cashCountPreviewRequestMessageSchema = z.object({
  type: z.literal("cash-count-preview-request"),
  request_id: requestId,
  counted_cash: z.int(),
});

const sessionOpenSaleRequestMessageSchema = z.object({
  type: z.literal("session-open-sale-request"),
  request_id: requestId,
});

const lockedClosersRequestMessageSchema = z.object({
  type: z.literal("locked-closers-request"),
  request_id: requestId,
});

export const registerRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  rendererPingMessageSchema,
  enrollmentStatusRequestMessageSchema,
  registerServiceRequestMessageSchema,
  registerNameRequestMessageSchema,
  enrollMessageSchema,
  checkEnrollmentCodeMessageSchema,
  openCashSessionMessageSchema,
  cashSessionRequestMessageSchema,
  recordCashMovementMessageSchema,
  cashMovementsRequestMessageSchema,
  cashMovementKindsRequestMessageSchema,
  closeCashSessionMessageSchema,
  closeLockedCashSessionMessageSchema,
  identifyLockedCloserMessageSchema,
  cashBalanceRequestMessageSchema,
  cashCountPreviewRequestMessageSchema,
  sessionOpenSaleRequestMessageSchema,
  lockedClosersRequestMessageSchema,
]);
export type RegisterRendererToCoreMessage = z.infer<typeof registerRendererToCoreMessageSchema>;

const enrollmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("code_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("storage_unavailable") }),
  z.object({ kind: z.literal("not_stored") }),
  z.object({ kind: z.literal("invalid_input"), fields: z.array(z.literal("code")) }),
]);
export type EnrollmentOutcome = z.infer<typeof enrollmentOutcomeSchema>;

const openCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("opened"), cash_session: openCashSessionSchema.nullable() }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("already_open") }),
  z.object({ kind: z.literal("invalid_opening_float") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type OpenCashSessionOutcome = z.infer<typeof openCashSessionOutcomeSchema>;

const cashSessionClosingOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("closed"),
    session: z.object({
      id: z.string(),
      expected_cash: z.number(),
      counted_cash: z.number(),
      difference: z.number(),
    }),
  }),
  z.object({ kind: z.literal("invalid_counted_cash") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("open_sale"), total: z.number(), cancellable: z.boolean() }),
]);

const closeCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  ...cashSessionClosingOutcomeSchema.options,
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("lacks_permission") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type CloseCashSessionOutcome = z.infer<typeof closeCashSessionOutcomeSchema>;

const closeLockedCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  ...cashSessionClosingOutcomeSchema.options,
  ...authorizationRefusalSchema.options,
  z.object({ kind: z.literal("not_locked") }),
]);
export type CloseLockedCashSessionOutcome = z.infer<typeof closeLockedCashSessionOutcomeSchema>;

const identifyLockedCloserOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("identified"), person: authorizedBySchema }),
  ...authorizationRefusalSchema.options,
  z.object({ kind: z.literal("not_locked") }),
]);
export type IdentifyLockedCloserOutcome = z.infer<typeof identifyLockedCloserOutcomeSchema>;

const cashDirectionSchema = z.enum(CASH_MOVEMENT_DIRECTIONS);

const cashBalanceLineSchema = z.object({ amount: z.number(), direction: cashDirectionSchema });

const cashBalanceSchema = z.object({
  opening_float: cashBalanceLineSchema,
  cash_sales: cashBalanceLineSchema,
  change_given: cashBalanceLineSchema,
  refunds: cashBalanceLineSchema,
  cash_in: cashBalanceLineSchema,
  expenses: cashBalanceLineSchema,
  withdrawals: cashBalanceLineSchema,
  expected: z.number(),
});
export type CashBalance = z.infer<typeof cashBalanceSchema>;

const cashCountPreviewSchema = z.object({ difference: z.number() });
export type CashCountPreview = z.infer<typeof cashCountPreviewSchema>;

const sessionOpenSaleSchema = z.object({ total: z.number(), cancellable: z.boolean() });
export type SessionOpenSale = z.infer<typeof sessionOpenSaleSchema>;

const recordCashMovementOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recorded"), authorized_by: authorizedBySchema.nullable() }),
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("invalid_reason"), max_length: z.number() }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("exceeds_expected_cash"), expected: z.number() }),
  ...authorizationRefusalSchema.options,
]);
export type RecordCashMovementOutcome = z.infer<typeof recordCashMovementOutcomeSchema>;

const cashMovementPersonSchema = z.object({ user_id: z.string(), first_name: z.string() });

export const cashMovementTypeSchema = z.enum(CASH_MOVEMENT_TYPES);

const listedCashMovementSchema = z.object({
  id: z.string(),
  type: cashMovementTypeSchema,
  amount: z.number(),
  reason: z.string().nullable(),
  direction: cashDirectionSchema,
  occurred_at: z.string(),
  actor: cashMovementPersonSchema,
  authorized_by: cashMovementPersonSchema.nullable(),
});
export type ListedCashMovement = z.infer<typeof listedCashMovementSchema>;

const recordableCashMovementKindsSchema = z.record(
  z.enum(CASH_MOVEMENT_KINDS),
  z.object({
    permission: z.custom<AuthorizablePermissionKey>(isAuthorizablePermissionKey),
    authorization_required: z.boolean(),
  }),
);
export type RecordableCashMovementKinds = z.infer<typeof recordableCashMovementKindsSchema>;

export const registerCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enrollment-status"), request_id: requestId, enrolled: z.boolean() }),
  z.object({
    type: z.literal("register-service"),
    request_id: requestId,
    service: z.enum(["in_service", "out_of_service"]),
  }),
  z.object({
    type: z.literal("register-name"),
    request_id: requestId,
    name: z.string().nullable(),
  }),
  z.object({
    type: z.literal("enrollment-result"),
    request_id: requestId,
    outcome: enrollmentOutcomeSchema,
  }),
  z.object({
    type: z.literal("enrollment-code-check"),
    request_id: requestId,
    fields: z.array(z.literal("code")),
  }),
  z.object({
    type: z.literal("open-cash-session-result"),
    request_id: requestId,
    outcome: openCashSessionOutcomeSchema,
  }),
  z.object({
    type: z.literal("close-cash-session-result"),
    request_id: requestId,
    outcome: closeCashSessionOutcomeSchema,
  }),
  z.object({
    type: z.literal("close-locked-cash-session-result"),
    request_id: requestId,
    outcome: closeLockedCashSessionOutcomeSchema,
  }),
  z.object({
    type: z.literal("identify-locked-closer-result"),
    request_id: requestId,
    outcome: identifyLockedCloserOutcomeSchema,
  }),
  z.object({
    type: z.literal("cash-balance"),
    request_id: requestId,
    balance: cashBalanceSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-balance-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("cash-count-preview"),
    request_id: requestId,
    preview: cashCountPreviewSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-count-preview-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("session-open-sale"),
    request_id: requestId,
    sale: sessionOpenSaleSchema.nullable(),
  }),
  z.object({ type: z.literal("session-open-sale-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("cash-session"),
    request_id: requestId,
    session: openCashSessionSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-session-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("record-cash-movement-result"),
    request_id: requestId,
    outcome: recordCashMovementOutcomeSchema,
  }),
  z.object({
    type: z.literal("cash-movements"),
    request_id: requestId,
    movements: z.array(listedCashMovementSchema).nullable(),
  }),
  z.object({ type: z.literal("cash-movements-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("cash-movement-kinds"),
    request_id: requestId,
    kinds: recordableCashMovementKindsSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-movement-kinds-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("locked-closers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("locked-closers-unavailable"), request_id: requestId }),
]);
export type RegisterCoreToRendererMessage = z.infer<typeof registerCoreToRendererMessageSchema>;
