import {
  ARGENTINA_TIME_ZONE,
  type AuthorizablePermissionKey,
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  CASH_MOVEMENT_TYPES,
  cashCharge,
  cashMovementPermission,
  cashMovementReason,
  isAuthorizablePermissionKey,
  isValidCashAmount,
  isValidCashMovementAmount,
  parseAmountCents,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizationSchema,
  authorizedBySchema,
  guardedActionRefusalSchema,
} from "../access/authorization.js";
import { pinAttemptRefusalSchema } from "../access/pin-attempt-refusal.js";
import {
  addProductOutcomeSchema,
  cancelSaleOutcomeSchema,
  changeLineQuantityOutcomeSchema,
  chargeSaleInCashOutcomeSchema,
  removeSaleLineOutcomeSchema,
  saleLineQuantitySchema,
  saleSchema,
  scannedCodeSchema,
  scanProductOutcomeSchema,
  searchProductsOutcomeSchema,
  searchQuerySchema,
} from "../sales/sale.js";

const requestId = z.string();

const cashAmountSchema = z.number().refine(isValidCashAmount);

export const openingFloatSchema = cashAmountSchema;
export const countedCashSchema = cashAmountSchema;

export const cashMovementAmountSchema = z.number().refine(isValidCashMovementAmount);

export {
  ARGENTINA_TIME_ZONE,
  CASH_MOVEMENT_REASON_MAX_LENGTH,
  CASH_MOVEMENT_TYPES,
  cashCharge,
  cashMovementPermission,
  cashMovementReason,
  parseAmountCents,
};

const rendererPingMessageSchema = z.object({
  type: z.literal("ping"),
});

const enrollmentStatusRequestMessageSchema = z.object({
  type: z.literal("enrollment-status-request"),
  request_id: requestId,
});

const registerNameRequestMessageSchema = z.object({
  type: z.literal("register-name-request"),
  request_id: requestId,
});

const enrollMessageSchema = z.object({
  type: z.literal("enroll"),
  request_id: requestId,
  code: z.string(),
});

const redeemPinCodeMessageSchema = z.object({
  type: z.literal("redeem-pin-code"),
  request_id: requestId,
  reset_code: z.string(),
  new_pin: z.string(),
});

const signInUsersRequestMessageSchema = z.object({
  type: z.literal("sign-in-users"),
  request_id: requestId,
});

const signInMessageSchema = z.object({
  type: z.literal("sign-in"),
  request_id: requestId,
  user_id: z.string(),
  pin: z.string(),
});

const signInLookupMessageSchema = z.object({
  type: z.literal("sign-in-lookup"),
  request_id: requestId,
  email: z.string(),
});

const firstPinCodeRequestMessageSchema = z.object({
  type: z.literal("first-pin-code-request"),
  request_id: requestId,
  user_id: z.string(),
});

const firstSignInMessageSchema = z.object({
  type: z.literal("first-sign-in"),
  request_id: requestId,
  user_id: z.string(),
  pin: z.string(),
});

const openCashSessionMessageSchema = z.object({
  type: z.literal("open-cash-session"),
  request_id: requestId,
  opening_float: openingFloatSchema,
});

const cashSessionRequestMessageSchema = z.object({
  type: z.literal("cash-session-request"),
  request_id: requestId,
});

const recordCashMovementMessageSchema = z.object({
  type: z.literal("record-cash-movement"),
  request_id: requestId,
  kind: z.enum(CASH_MOVEMENT_KINDS),
  amount: cashMovementAmountSchema,
  reason: z.string().refine((reason) => cashMovementReason(reason) !== undefined),
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

const closeCashSessionMessageSchema = z.object({
  type: z.literal("close-cash-session"),
  request_id: requestId,
  session_id: z.string(),
  counted_cash: countedCashSchema,
  authorization: authorizationSchema.optional(),
});

const closeLockedCashSessionMessageSchema = z.object({
  type: z.literal("close-locked-cash-session"),
  request_id: requestId,
  session_id: z.string(),
  counted_cash: countedCashSchema,
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

const authorizersRequestMessageSchema = z.object({
  type: z.literal("authorizers"),
  request_id: requestId,
  permission: z.custom<AuthorizablePermissionKey>(isAuthorizablePermissionKey),
});

const scanProductMessageSchema = z.object({
  type: z.literal("scan-product"),
  request_id: requestId,
  code: scannedCodeSchema,
});

const changeLineQuantityMessageSchema = z.object({
  type: z.literal("change-line-quantity"),
  request_id: requestId,
  line_id: z.string(),
  quantity: saleLineQuantitySchema,
  expected_quantity: saleLineQuantitySchema,
});

const removeSaleLineMessageSchema = z.object({
  type: z.literal("remove-sale-line"),
  request_id: requestId,
  line_id: z.string(),
});

const cancelSaleMessageSchema = z.object({
  type: z.literal("cancel-sale"),
  request_id: requestId,
});

const searchProductsMessageSchema = z.object({
  type: z.literal("search-products"),
  request_id: requestId,
  query: searchQuerySchema,
});

const addProductMessageSchema = z.object({
  type: z.literal("add-product"),
  request_id: requestId,
  product_id: z.string(),
});

const saleRequestMessageSchema = z.object({
  type: z.literal("sale-request"),
  request_id: requestId,
});

const chargeSaleInCashMessageSchema = z.object({
  type: z.literal("charge-sale-in-cash"),
  request_id: requestId,
  sale_id: z.string(),
  tendered: z.int(),
});

const signOutMessageSchema = z.object({
  type: z.literal("sign-out"),
  request_id: requestId,
});

export const rendererToCoreMessageSchema = z.discriminatedUnion("type", [
  rendererPingMessageSchema,
  enrollmentStatusRequestMessageSchema,
  registerNameRequestMessageSchema,
  enrollMessageSchema,
  redeemPinCodeMessageSchema,
  signInUsersRequestMessageSchema,
  signInMessageSchema,
  signInLookupMessageSchema,
  firstPinCodeRequestMessageSchema,
  firstSignInMessageSchema,
  openCashSessionMessageSchema,
  cashSessionRequestMessageSchema,
  recordCashMovementMessageSchema,
  cashMovementsRequestMessageSchema,
  closeCashSessionMessageSchema,
  closeLockedCashSessionMessageSchema,
  identifyLockedCloserMessageSchema,
  cashBalanceRequestMessageSchema,
  authorizersRequestMessageSchema,
  scanProductMessageSchema,
  changeLineQuantityMessageSchema,
  removeSaleLineMessageSchema,
  cancelSaleMessageSchema,
  searchProductsMessageSchema,
  addProductMessageSchema,
  saleRequestMessageSchema,
  chargeSaleInCashMessageSchema,
  signOutMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

export const openCashSessionRequestSchema = openCashSessionMessageSchema.omit({
  type: true,
  request_id: true,
});
export const countedCashRequestSchema = closeCashSessionMessageSchema.pick({ counted_cash: true });

const enrollmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("enrolled") }),
  z.object({ kind: z.literal("code_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
  z.object({ kind: z.literal("storage_unavailable") }),
  z.object({ kind: z.literal("not_stored") }),
]);
export type EnrollmentOutcome = z.infer<typeof enrollmentOutcomeSchema>;

const signedInPersonSchema = z.object({
  user_id: z.string(),
  first_name: z.string(),
  permission_keys: z.array(z.string()),
});

const pinCodeRedemptionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redeemed") }),
  z.object({ kind: z.literal("resumed"), person: signedInPersonSchema }),
  z.object({ kind: z.literal("cash_session_opened_by_another") }),
  z.object({ kind: z.literal("code_invalid") }),
  z.object({ kind: z.literal("code_expired") }),
  z.object({ kind: z.literal("code_burned") }),
  z.object({ kind: z.literal("pin_rejected") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type PinCodeRedemptionOutcome = z.infer<typeof pinCodeRedemptionOutcomeSchema>;

const signInOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("signed_in"), person: signedInPersonSchema }),
  ...pinAttemptRefusalSchema.options,
  z.object({ kind: z.literal("no_register_permission") }),
  z.object({ kind: z.literal("cash_session_opened_by_another") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

const openCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("opened"),
    session: z.object({ id: z.string(), opened_at: z.string(), opening_float: z.number() }),
  }),
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
  z.object({ kind: z.literal("open_sale"), total: z.number() }),
]);

const closeCashSessionOutcomeSchema = z.discriminatedUnion("kind", [
  ...cashSessionClosingOutcomeSchema.options,
  ...guardedActionRefusalSchema.options,
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

const cashBalanceSchema = z.object({
  opening_float: z.number(),
  cash_sales: z.number(),
  change_given: z.number(),
  refunds: z.number(),
  cash_in: z.number(),
  expenses: z.number(),
  withdrawals: z.number(),
  expected: z.number(),
});
export type CashBalance = z.infer<typeof cashBalanceSchema>;

const openCashSessionSchema = z.object({
  id: z.string(),
  opened_at: z.string(),
  opened_by: signedInPersonSchema,
});
export type OpenCashSession = z.infer<typeof openCashSessionSchema>;

const recordCashMovementOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recorded"), authorized_by: authorizedBySchema.nullable() }),
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("invalid_reason") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("exceeds_expected_cash"), expected: z.number() }),
  ...authorizationRefusalSchema.options,
]);
export type RecordCashMovementOutcome = z.infer<typeof recordCashMovementOutcomeSchema>;

const cashMovementPersonSchema = z.object({ user_id: z.string(), first_name: z.string() });

const listedCashMovementSchema = z.object({
  id: z.string(),
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: z.number(),
  reason: z.string().nullable(),
  occurred_at: z.string(),
  actor: cashMovementPersonSchema,
  authorized_by: cashMovementPersonSchema.nullable(),
});
export type ListedCashMovement = z.infer<typeof listedCashMovementSchema>;

const signInUserSchema = z.object({ id: z.string(), first_name: z.string() });
export type SignInUser = z.infer<typeof signInUserSchema>;

const signInLookupOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("has_pin"), user: signInUserSchema }),
  z.object({ kind: z.literal("no_pin"), user: signInUserSchema }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("invalid_email") }),
  z.object({ kind: z.literal("not_synced") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInLookupOutcome = z.infer<typeof signInLookupOutcomeSchema>;

const firstPinCodeRequestOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("sent") }),
  z.object({ kind: z.literal("pin_already_set") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("rate_limited"), retry_after_seconds: z.int().nonnegative() }),
  z.object({ kind: z.literal("unreachable") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type FirstPinCodeRequestOutcome = z.infer<typeof firstPinCodeRequestOutcomeSchema>;

export const coreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("enrollment-status"), request_id: requestId, enrolled: z.boolean() }),
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
    type: z.literal("pin-code-redemption-result"),
    request_id: requestId,
    outcome: pinCodeRedemptionOutcomeSchema,
  }),
  z.object({
    type: z.literal("sign-in-users"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("sign-in-users-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("sign-in-result"),
    request_id: requestId,
    outcome: signInOutcomeSchema,
  }),
  z.object({
    type: z.literal("sign-in-lookup-result"),
    request_id: requestId,
    outcome: signInLookupOutcomeSchema,
  }),
  z.object({
    type: z.literal("first-pin-code-request-result"),
    request_id: requestId,
    outcome: firstPinCodeRequestOutcomeSchema,
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
    type: z.literal("authorizers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("authorizers-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("scan-product-result"),
    request_id: requestId,
    outcome: scanProductOutcomeSchema,
  }),
  z.object({
    type: z.literal("change-line-quantity-result"),
    request_id: requestId,
    outcome: changeLineQuantityOutcomeSchema,
  }),
  z.object({
    type: z.literal("remove-sale-line-result"),
    request_id: requestId,
    outcome: removeSaleLineOutcomeSchema,
  }),
  z.object({
    type: z.literal("cancel-sale-result"),
    request_id: requestId,
    outcome: cancelSaleOutcomeSchema,
  }),
  z.object({
    type: z.literal("search-products-result"),
    request_id: requestId,
    outcome: searchProductsOutcomeSchema,
  }),
  z.object({
    type: z.literal("add-product-result"),
    request_id: requestId,
    outcome: addProductOutcomeSchema,
  }),
  z.object({
    type: z.literal("charge-sale-in-cash-result"),
    request_id: requestId,
    outcome: chargeSaleInCashOutcomeSchema,
  }),
  z.object({ type: z.literal("sale"), request_id: requestId, sale: saleSchema.nullable() }),
  z.object({ type: z.literal("sale-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("sale-not-permitted"), request_id: requestId }),
  z.object({ type: z.literal("signed-out"), request_id: requestId }),
  z.object({ type: z.literal("pulled") }),
]);
export type CoreToRendererMessage = z.infer<typeof coreToRendererMessageSchema>;

const mainHealthCheckMessageSchema = z.object({
  type: z.literal("health-check"),
});

export const mainToCoreMessageSchema = mainHealthCheckMessageSchema;
export type MainToCoreMessage = z.infer<typeof mainToCoreMessageSchema>;

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;
