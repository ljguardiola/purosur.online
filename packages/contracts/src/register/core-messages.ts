import {
  ARGENTINA_TIME_ZONE,
  type AuthorizablePermissionKey,
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_TYPES,
  isAuthorizablePermissionKey,
  REGISTER_ABILITIES,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizationSchema,
  authorizedBySchema,
} from "../access/authorization.js";
import { pinAttemptRefusalSchema } from "../access/pin-attempt-refusal.js";
import {
  addProductOutcomeSchema,
  cancelSaleOutcomeSchema,
  cashChargeSchema,
  changeLineQuantityOutcomeSchema,
  chargeSaleByTransferOutcomeSchema,
  chargeSaleInCashOutcomeSchema,
  removeSaleLineOutcomeSchema,
  saleLineQuantitySchema,
  saleSchema,
  scanProductOutcomeSchema,
  searchProductsOutcomeSchema,
} from "../sales/sale.js";

const requestId = z.string();

export { ARGENTINA_TIME_ZONE };

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

export const signInLookupMessageSchema = z.object({
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

const cancelLockedSaleMessageSchema = z.object({
  type: z.literal("cancel-locked-sale"),
  request_id: requestId,
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

const sessionOpenSaleRequestMessageSchema = z.object({
  type: z.literal("session-open-sale-request"),
  request_id: requestId,
});

const authorizersRequestMessageSchema = z.object({
  type: z.literal("authorizers"),
  request_id: requestId,
  permission: z.custom<AuthorizablePermissionKey>(isAuthorizablePermissionKey),
});

const lockedClosersRequestMessageSchema = z.object({
  type: z.literal("locked-closers-request"),
  request_id: requestId,
});

const scanProductMessageSchema = z.object({
  type: z.literal("scan-product"),
  request_id: requestId,
  code: z.string().min(1),
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
  query: z.string(),
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

export const chargeSaleInCashMessageSchema = z.object({
  type: z.literal("charge-sale-in-cash"),
  request_id: requestId,
  sale_id: z.string(),
  tendered: z.int(),
});

const chargeSaleByTransferMessageSchema = z.object({
  type: z.literal("charge-sale-by-transfer"),
  request_id: requestId,
  sale_id: z.string(),
});

const cashChargeRequestMessageSchema = z.object({
  type: z.literal("cash-charge-request"),
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
  cashMovementKindsRequestMessageSchema,
  closeCashSessionMessageSchema,
  closeLockedCashSessionMessageSchema,
  cancelLockedSaleMessageSchema,
  identifyLockedCloserMessageSchema,
  cashBalanceRequestMessageSchema,
  sessionOpenSaleRequestMessageSchema,
  authorizersRequestMessageSchema,
  lockedClosersRequestMessageSchema,
  scanProductMessageSchema,
  changeLineQuantityMessageSchema,
  removeSaleLineMessageSchema,
  cancelSaleMessageSchema,
  searchProductsMessageSchema,
  addProductMessageSchema,
  saleRequestMessageSchema,
  chargeSaleInCashMessageSchema,
  chargeSaleByTransferMessageSchema,
  cashChargeRequestMessageSchema,
  signOutMessageSchema,
]);
export type RendererToCoreMessage = z.infer<typeof rendererToCoreMessageSchema>;

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
  abilities: z.array(z.enum(REGISTER_ABILITIES)),
});

const openCashSessionSchema = z.object({
  id: z.string(),
  opened_at: z.string(),
  opened_by: signedInPersonSchema,
  locked: z.boolean(),
});
export type OpenCashSession = z.infer<typeof openCashSessionSchema>;

const pinCodeRedemptionOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("redeemed") }),
  z.object({
    kind: z.literal("resumed"),
    person: signedInPersonSchema,
    cash_session: openCashSessionSchema.nullable(),
  }),
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
  z.object({
    kind: z.literal("signed_in"),
    person: signedInPersonSchema,
    cash_session: openCashSessionSchema.nullable(),
  }),
  ...pinAttemptRefusalSchema.options,
  z.object({ kind: z.literal("no_register_permission") }),
  z.object({ kind: z.literal("cash_session_opened_by_another") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type SignInOutcome = z.infer<typeof signInOutcomeSchema>;

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

const cancelLockedSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("has_approved_payment") }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  ...authorizationRefusalSchema.options,
  z.object({ kind: z.literal("not_locked") }),
]);
export type CancelLockedSaleOutcome = z.infer<typeof cancelLockedSaleOutcomeSchema>;

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
    type: z.literal("cancel-locked-sale-result"),
    request_id: requestId,
    outcome: cancelLockedSaleOutcomeSchema,
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
    type: z.literal("authorizers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("authorizers-unavailable"), request_id: requestId }),
  z.object({
    type: z.literal("locked-closers"),
    request_id: requestId,
    users: z.array(signInUserSchema),
  }),
  z.object({ type: z.literal("locked-closers-unavailable"), request_id: requestId }),
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
  z.object({
    type: z.literal("charge-sale-by-transfer-result"),
    request_id: requestId,
    outcome: chargeSaleByTransferOutcomeSchema,
  }),
  z.object({ type: z.literal("sale"), request_id: requestId, sale: saleSchema.nullable() }),
  z.object({ type: z.literal("sale-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("sale-not-permitted"), request_id: requestId }),
  z.object({
    type: z.literal("cash-charge"),
    request_id: requestId,
    charge: cashChargeSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-charge-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("cash-charge-not-permitted"), request_id: requestId }),
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
