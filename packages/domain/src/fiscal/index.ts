export { arcaCertificateExpiryStanding } from "./model/arca-certificate-expiry.js";
export { ARCA_VITALITY_CHECK_INTERVAL_MS } from "./model/arca-reachability.js";
export type {
  BuyerIdentificationThreshold,
  ChargeRefusal,
} from "./model/buyer-identification-threshold.js";
export {
  chargeRefusal,
  earliestThresholdStartDay,
  isBuyerIdentificationThresholdAmount,
  thresholdInEffectOn,
  thresholdScheduledAfter,
} from "./model/buyer-identification-threshold.js";
export { nextBuyerTaxStatusFetchAt } from "./model/buyer-tax-status-fetch.js";
export type { BuyerTaxStatusOption } from "./model/buyer-tax-status-set.js";
export {
  isValidBuyerTaxStatusSet,
  latestBuyerTaxStatusSet,
} from "./model/buyer-tax-status-set.js";
export { selectConsumerBuyerTaxStatus } from "./model/consumer-buyer-tax-status.js";
export { isValidCuit } from "./model/cuit.js";
export type {
  DeferredSale,
  DeferredSaleDocumentBlock,
  DeferredSaleReference,
} from "./model/deferred-sale.js";
export {
  deferredSaleDocumentBlock,
  randomShortCode,
  SHORT_CODE_ALPHABET,
} from "./model/deferred-sale.js";
export type {
  AuthorizedFacturaC,
  FacturaCFiscalBlock,
  OfflineAuthorizedFacturaC,
  OfflineFacturaCFiscalBlock,
} from "./model/factura-c-fiscal-block.js";
export {
  AUTHORIZATION_CODE_TYPE_CAE,
  CURRENCY_PESOS,
  EXCHANGE_RATE_PESOS,
  FACTURA_C_VOUCHER_TYPE,
  FINAL_CONSUMER_DOCUMENT_NUMBER,
  FINAL_CONSUMER_DOCUMENT_TYPE,
  facturaCFiscalBlock,
  offlineFacturaCFiscalBlock,
  TAX_AUTHORITY_QR_URL,
} from "./model/factura-c-fiscal-block.js";
export {
  FISCAL_ADDRESS_NAME_MAX_LENGTH,
  FISCAL_ADDRESS_STREET_ADDRESS_MAX_LENGTH,
  isFiscalAddressNameTooLong,
  isFiscalAddressStreetAddressTooLong,
  isSameFiscalAddressName,
} from "./model/fiscal-address.js";
export type {
  FiscalEmissionStoppedReport,
  LatestPreEmissionGateOutcome,
} from "./model/fiscal-emission-stop.js";
export {
  fiscalEmissionStoppedReportOf,
  fiscalEmissionStopReasonOf,
} from "./model/fiscal-emission-stop.js";
export type { FiscalOnlineSignalEvidence } from "./model/fiscal-online-signal.js";
export { REGISTER_HEALTH_CHECK_INTERVAL_MS } from "./model/fiscal-online-signal.js";
export type {
  FiscalDocumentType,
  RejectionStandingChange,
  TaxAuthorityRejection,
} from "./model/fiscal-rejection-standing.js";
export { FACTURA_C_DOCUMENT_TYPE } from "./model/fiscal-rejection-standing.js";
export type {
  DocumentTypeReportState,
  FortnightPresentationRow,
  FortnightReportMovement,
  FortnightReportState,
} from "./model/fortnight-report.js";
export {
  documentTypePresentationState,
  fortnightClosesAt,
  fortnightPresentationRows,
  fortnightReportDeadline,
  fortnightReportStanding,
  isFortnightReportOutstanding,
  isOfflineDocumentReported,
  owesFortnightReport,
} from "./model/fortnight-report.js";
export { generationStampOf } from "./model/generation-stamp.js";
export {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  ISSUER_TAX_STATUS,
  isIssuerIdentificationActivityStartDate,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
  latestIssuerIdentification,
} from "./model/issuer-identification.js";
export type { Fortnight } from "./model/offline-authorization-code.js";
export {
  fortnightAfter,
  fortnightContaining,
  fortnightsWithinRequestWindowOn,
  hasFortnightStarted,
  isSecondHalfOfMonth,
  OFFLINE_AUTHORIZATION_CODE_ACQUISITION_RETRY_INTERVAL_MS,
  offlineAuthorizationCodeRequestOpensOn,
} from "./model/offline-authorization-code.js";
export type { OfflineAuthorizationCodeAcquisitionUrgency } from "./model/offline-authorization-code-acquisition-urgency.js";
export { offlineAuthorizationCodeAcquisitionUrgency } from "./model/offline-authorization-code-acquisition-urgency.js";
export type { RegisterOfflineAuthorizationCodeHolding } from "./model/offline-authorization-code-holding.js";
export { mustHoldOfflineAuthorizationCode } from "./model/offline-authorization-code-holding.js";
export type { OfflineFiscalDocumentIssuedFact } from "./model/offline-fiscal-document.js";
export {
  offlineFiscalDocument,
  offlineFiscalDocumentIssuedEvent,
} from "./model/offline-fiscal-document.js";
export type {
  OfflineNumberBlockRange,
  OfflineNumberBlockStatus,
} from "./model/offline-number-block.js";
export {
  nextOfflineNumber,
  OFFLINE_NUMBER_BLOCK_STATUSES,
} from "./model/offline-number-block.js";
export {
  isPointOfSaleNumber,
  POINT_OF_SALE_NUMBER_MAX,
} from "./model/point-of-sale.js";
export type {
  FacturaC,
  IssuerIdentificationInEffect,
  PreEmissionGateFailureReason,
  PreEmissionGateOutcome,
} from "./model/pre-emission-gate.js";
export { PRE_EMISSION_GATE_FAILURE_REASONS, preEmissionGate } from "./model/pre-emission-gate.js";
export { preEmissionGateFailedEvent } from "./model/pre-emission-gate-failed-event.js";
export type {
  DeferralReason,
  FiscalDocumentState,
  OfflineAuthorizationCause,
  RealTimeAuthorizationAnswer,
  RealTimeAuthorizationResolution,
  RejectionClass,
} from "./model/real-time-authorization.js";
export {
  DEFERRAL_REASONS,
  IN_PROGRESS_FISCAL_DOCUMENT_STATES,
  invoiceDateOf,
  NUMBER_CONSUMING_STATES,
  OFFLINE_AUTHORIZATION_CAUSES,
  REAL_TIME_AUTHORIZATION_TIMEOUT_MS,
  REJECTION_CLASSES,
  SERIES_WAITING_STATES,
} from "./model/real-time-authorization.js";
export {
  awaitsUnclearOutcomeDecision,
  UNCLEAR_ANSWER_KINDS,
  unclearOutcomeSince,
} from "./model/unclear-outcome-decision.js";
export { isWsaaTokenValid, WSAA_ALREADY_AUTHENTICATED_RETRY_MS } from "./model/wsaa-token.js";
