export type { Clock } from "../../shared/index.js";
export type { ArcaReachabilityEvidence } from "../model/arca-reachability.js";
export type {
  CashSessionStanding,
  ClockLowering,
  ClockMark,
} from "../model/clock-correction.js";
export type { FiscalOnlineSignalEvidence } from "../model/fiscal-online-signal.js";
export type {
  RejectionStandingChange,
  TaxAuthorityRejection,
} from "../model/fiscal-rejection-standing.js";
export type {
  FiscalTask,
  FiscalTaskDocumentType,
  FiscalTaskKind,
} from "../model/fiscal-task.js";
export type { Fortnight } from "../model/offline-authorization-code.js";
export type { OfflineFiscalDocument } from "../model/offline-fiscal-document.js";
export type {
  CreditNoteDecision,
  ExternalBilling,
  ExternalInvoicingRegularization,
  LocalRequestAtNumber,
  OrphanRegularization,
  RequestsAtNumber,
  SaleDocument,
  VoucherReference,
} from "../model/orphan-authorization.js";
export type { ListedOwedPresentation } from "../model/owed-presentation-list.js";
export type {
  DeferralReason,
  OfflineAuthorizationCause,
  OfflineSeries,
  RealTimeAuthorizationAnswer,
  RealTimeAuthorizationResolution,
  RealTimeSeries,
  RejectionClass,
} from "../model/real-time-authorization.js";
export type {
  ClearAuthorizationAnswer,
  OutcomeToldToAskingRegister,
  RecordedRequestOutcome,
  UnclearDocumentSettlement,
  UnclearOutcomeDecision,
} from "../model/unclear-outcome-decision.js";
export type {
  ApplyUnclearOutcomeDecisionsPorts,
  UnclearDocumentSettled,
  UnclearFiscalDocuments,
  UnclearOutcomeAnswer,
  UnclearOutcomeCloud,
  UnclearOutcomeQuestion,
} from "./apply-unclear-outcome-decision-ports.js";
export type { ApplyUnclearOutcomeDecisionsOutcome } from "./apply-unclear-outcome-decisions.js";
export { applyUnclearOutcomeDecisions } from "./apply-unclear-outcome-decisions.js";
export type {
  ArcaOnlineStatusPorts,
  ArcaReachabilityReader,
  WsaaTokenReader,
} from "./arca-online-status-ports.js";
export type {
  ArcaVitalityPorts,
  ArcaVitalityResult,
  ArcaVitalityService,
  ArcaVitalityStore,
  VitalityCheckRecord,
} from "./arca-vitality-ports.js";
export type {
  AskAboutUnclearOutcomeInput,
  AskAboutUnclearOutcomeOutcome,
} from "./ask-about-unclear-outcome.js";
export { askAboutUnclearOutcome } from "./ask-about-unclear-outcome.js";
export type {
  AssignAwaitedOfflineNumberBlockInput,
  AssignAwaitedOfflineNumberBlockOutcome,
} from "./assign-awaited-offline-number-block.js";
export { assignAwaitedOfflineNumberBlock } from "./assign-awaited-offline-number-block.js";
export type {
  AssignNextOfflineNumberBlockInput,
  AssignNextOfflineNumberBlockOutcome,
} from "./assign-next-offline-number-block.js";
export type { AssignNextOfflineNumberBlocksOutcome } from "./assign-next-offline-number-blocks.js";
export { assignNextOfflineNumberBlocks } from "./assign-next-offline-number-blocks.js";
export type {
  AssignFirstOfflineNumberBlockOutcome,
  AssignOfflineNumberBlockInput,
} from "./assign-offline-number-block.js";
export { assignFirstOfflineNumberBlock } from "./assign-offline-number-block.js";
export type {
  AuthorizeFiscalDocumentInput,
  AuthorizeFiscalDocumentOutcome,
  FiscalDocumentAuthorizationRequest,
} from "./authorize-fiscal-document.js";
export { authorizeFiscalDocument } from "./authorize-fiscal-document.js";
export type {
  BuyerIdentificationThresholdOverview,
  BuyerIdentificationThresholdPorts,
  BuyerIdentificationThresholdReader,
  BuyerIdentificationThresholdStore,
  BuyerIdentificationThresholdStoreTransaction,
  NewBuyerIdentificationThreshold,
} from "./buyer-identification-threshold-store.js";
export type {
  BuyerTaxStatusFetchResult,
  BuyerTaxStatusSource,
  FetchBuyerTaxStatusSetPorts,
} from "./buyer-tax-status-source.js";
export type {
  BuyerTaxStatusPorts,
  BuyerTaxStatusSetVersion,
  BuyerTaxStatusStore,
  BuyerTaxStatusStoreTransaction,
} from "./buyer-tax-status-store.js";
export type { CheckArcaVitalityOutcome } from "./check-arca-vitality.js";
export { checkArcaVitality } from "./check-arca-vitality.js";
export type {
  ClockCorrectionLedger,
  ClockCorrectionRecord,
  ClockCorrectionTransaction,
} from "./clock-correction-ports.js";
export type {
  BranchClockCorrection,
  ClockCorrectionReader,
} from "./clock-correction-reader.js";
export type {
  ConfigureRegisterOfflinePointOfSaleInput,
  ConfigureRegisterOfflinePointOfSaleOutcome,
} from "./configure-register-offline-point-of-sale.js";
export { configureRegisterOfflinePointOfSale } from "./configure-register-offline-point-of-sale.js";
export type {
  ConfigureRegisterPointOfSaleInput,
  ConfigureRegisterPointOfSaleOutcome,
} from "./configure-register-point-of-sale.js";
export { configureRegisterPointOfSale } from "./configure-register-point-of-sale.js";
export type {
  CorrectRegisterClockGrant,
  CorrectRegisterClockOutcome,
  CorrectRegisterClockPorts,
} from "./correct-register-clock.js";
export { correctRegisterClock } from "./correct-register-clock.js";
export type {
  CreateFiscalAddressInput,
  CreateFiscalAddressOutcome,
} from "./create-fiscal-address.js";
export { createFiscalAddress } from "./create-fiscal-address.js";
export type {
  CreditNote,
  CreditNoteAuthorizationRecord,
  CreditNoteLane,
  CreditNoteLanes,
  CreditNoteRejectionRecord,
  CreditNoteRequestRecord,
  CreditNoteRequests,
  CreditNoteSolicitation,
  CreditNoteStanding,
  IssueCreditNotePorts,
  TaxAuthorityCreditNoteInvoicing,
} from "./credit-note-ports.js";
export { CreditNoteNumberTaken } from "./credit-note-ports.js";
export type { CurrentFortnightCodeStanding } from "./current-fortnight-code-after-obtaining.js";
export { currentFortnightCodeAfterObtaining } from "./current-fortnight-code-after-obtaining.js";
export type {
  DecideSaleAuthorizationInput,
  DecideSaleAuthorizationOutcome,
} from "./decide-sale-authorization.js";
export { decideSaleAuthorization } from "./decide-sale-authorization.js";
export type {
  DecideUnclearRealTimeOutcomeInput,
  DecideUnclearRealTimeOutcomeOutcome,
} from "./decide-unclear-real-time-outcome.js";
export { decideUnclearRealTimeOutcome } from "./decide-unclear-real-time-outcome.js";
export type { ShortCodeRandomness } from "./deferred-sale-ports.js";
export { ShortCodeTaken } from "./deferred-sale-ports.js";
export type {
  DiagnoseNumberingConflictInput,
  DiagnoseNumberingConflictOutcome,
} from "./diagnose-numbering-conflict.js";
export { diagnoseNumberingConflict } from "./diagnose-numbering-conflict.js";
export type {
  EditFiscalAddressInput,
  EditFiscalAddressOutcome,
} from "./edit-fiscal-address.js";
export { editFiscalAddress } from "./edit-fiscal-address.js";
export type {
  EditIssuerIdentificationInput,
  EditIssuerIdentificationOutcome,
} from "./edit-issuer-identification.js";
export { editIssuerIdentification } from "./edit-issuer-identification.js";
export type {
  FetchBuyerTaxStatusSetInput,
  FetchBuyerTaxStatusSetOutcome,
} from "./fetch-buyer-tax-status-set.js";
export { fetchBuyerTaxStatusSet } from "./fetch-buyer-tax-status-set.js";
export type {
  FiscalAddress,
  FiscalAddressChange,
  FiscalAddressPorts,
  FiscalAddressReader,
  FiscalAddressStore,
  FiscalAddressStoreTransaction,
  NewFiscalAddress,
} from "./fiscal-address-store.js";
export { FiscalAddressNameConflict } from "./fiscal-address-store.js";
export type {
  AuthorizationRequestRecord,
  AuthorizeFiscalDocumentPorts,
  FiscalDocumentData,
  FiscalDocumentSolicitation,
  PointOfSaleLane,
  PointOfSaleLanes,
  RecordedAuthorizationRequest,
  SolicitationAnswer,
  TaxAuthorityInvoicing,
  WsaaTokenSource,
} from "./fiscal-document-authorization-ports.js";
export { FiscalDocumentAlreadyRecorded } from "./fiscal-document-authorization-ports.js";
export type {
  BranchFortnightPresentation,
  FortnightPresentationReader,
} from "./fortnight-presentation-reader.js";
export type {
  FortnightPresentationNeedingRegularization,
  FortnightRegularizationReader,
} from "./fortnight-regularization-reader.js";
export type {
  DocumentTypeReportChange,
  FortnightReportChange,
  FortnightReportKey,
  FortnightReportPorts,
  FortnightReportStore,
  HeldFortnightReport,
  NoMovementDeclarationAnswer,
  NoMovementDeclarationCall,
  NoMovementDeclarationLookupAnswer,
  OfflineDocumentBatchLimitAnswer,
  OfflineDocumentLastReportedAnswer,
  OfflineDocumentLastReportedCall,
  OfflineDocumentOfFortnight,
  OfflineDocumentReportAnswer,
  OfflineDocumentReportCall,
  OfflineDocumentsOfFortnight,
  OwedFortnightReport,
  RecordedFortnightReport,
  RegisterEventStreams,
  TaxAuthorityNoMovementDeclarations,
  TaxAuthorityOfflineDocumentReports,
} from "./fortnight-report-ports.js";
export type {
  InterruptedRealTimeAuthorization,
  InterruptedRealTimeAuthorizationPorts,
  InterruptedRealTimeAuthorizations,
  InterruptedRealTimeAuthorizationsTransaction,
} from "./interrupted-real-time-authorization-ports.js";
export type {
  IssueCreditNoteInput,
  IssueCreditNoteOutcome,
} from "./issue-credit-note.js";
export { creditNoteAnswerOf, issueCreditNote } from "./issue-credit-note.js";
export type {
  AuthorizedIssuerIdentification,
  EditableIssuerIdentification,
  IssuerIdentification,
  IssuerIdentificationPorts,
  IssuerIdentificationReader,
  IssuerIdentificationStore,
  IssuerIdentificationStoreTransaction,
  NewIssuerIdentificationVersion,
} from "./issuer-identification-store.js";
export type {
  DiagnoseNumberingConflictPorts,
  NumberingConflictLane,
  NumberingConflictLanes,
  NumberingConflictRequest,
  NumberingConflictRequests,
  NumberingDiagnosisRecord,
  NumberingFreeze,
  ReconcileNumberingConflictPorts,
} from "./numbering-conflict-ports.js";
export type {
  FortnightAcquisitionOutcome,
  ObtainOfflineAuthorizationCodesOutcome,
} from "./obtain-offline-authorization-codes.js";
export { obtainOfflineAuthorizationCodes } from "./obtain-offline-authorization-codes.js";
export type {
  KeptOfflineAuthorizationCode,
  OfflineAuthorizationCode,
  OfflineAuthorizationCodeAcquisition,
  OfflineAuthorizationCodeCall,
  OfflineAuthorizationCodeLookupAnswer,
  OfflineAuthorizationCodeOrigin,
  OfflineAuthorizationCodePorts,
  OfflineAuthorizationCodeRequestAnswer,
  OfflineAuthorizationCodeStore,
  TaxAuthorityOfflineAuthorizationCodes,
} from "./offline-authorization-code-ports.js";
export type {
  OfflineNumberBlockRecord,
  OfflineNumberBlockStore,
} from "./offline-number-block-store.js";
export type {
  AuthorizationNumber,
  OrphanRegularizationLane,
  OrphanRegularizationLanes,
  OrphanStandingReader,
  RegularizeOrphanAuthorizationPorts,
} from "./orphan-authorization-ports.js";
export type { OwedPresentationList } from "./owed-presentation-list-ports.js";
export type {
  ArcaOnlineStatus,
  ReadArcaOnlineStatusInput,
} from "./read-arca-online-status.js";
export { readArcaOnlineStatus } from "./read-arca-online-status.js";
export type {
  ClockGuardBlock,
  ReadRegisterClockGuardPorts,
  RegisterClockGuardState,
} from "./read-register-clock-guard.js";
export { readRegisterClockGuard } from "./read-register-clock-guard.js";
export type {
  CompletedSaleFiscalDocument,
  CompletedSaleFiscalDocuments,
} from "./read-unknown-fiscal-documents.js";
export { readUnknownFiscalDocuments } from "./read-unknown-fiscal-documents.js";
export type {
  RealTimeAuthorizationCall,
  RealTimeAuthorizationPorts,
  RealTimeAuthorizationResolved,
  RealTimeFiscalDocuments,
  RealTimeTaxAuthority,
  RequestedFiscalDocument,
  RoundTripSamples,
  WaitingFiscalDocument,
} from "./real-time-authorization-ports.js";
export type {
  ReconcileNumberingConflictInput,
  ReconcileNumberingConflictOutcome,
} from "./reconcile-numbering-conflict.js";
export { reconcileNumberingConflict } from "./reconcile-numbering-conflict.js";
export type {
  RecordAuthorizedCuitInput,
  RecordAuthorizedCuitOutcome,
} from "./record-authorized-cuit.js";
export { recordAuthorizedCuit } from "./record-authorized-cuit.js";
export type {
  RecordBuyerIdentificationThresholdInput,
  RecordBuyerIdentificationThresholdOutcome,
} from "./record-buyer-identification-threshold.js";
export { recordBuyerIdentificationThreshold } from "./record-buyer-identification-threshold.js";
export type {
  RecordBuyerTaxStatusSetInput,
  RecordBuyerTaxStatusSetOutcome,
} from "./record-buyer-tax-status-set.js";
export { recordBuyerTaxStatusSet } from "./record-buyer-tax-status-set.js";
export type { RecordRegisterHealthCheckOutcome } from "./record-register-health-check.js";
export { recordRegisterHealthCheck } from "./record-register-health-check.js";
export type {
  RecordTaxAuthorityLastAuthorizedInput,
  RecordTaxAuthorityLastAuthorizedOutcome,
} from "./record-tax-authority-last-authorized.js";
export { recordTaxAuthorityLastAuthorized } from "./record-tax-authority-last-authorized.js";
export type {
  RegisterClockGuardReader,
  TaxAuthorityFloor,
} from "./register-clock-guard-ports.js";
export type {
  RegisterHealthCheck,
  RegisterHealthCheckPorts,
  RegisterHealthChecks,
} from "./register-health-check-ports.js";
export type {
  RegisterOfflinePointOfSale,
  RegisterOfflinePointOfSaleRecord,
  RegisterOfflinePointOfSaleStore,
  RegisterOfflinePointOfSaleStoreTransaction,
} from "./register-offline-point-of-sale-store.js";
export type {
  BranchRegisterPointOfSale,
  LockBranchRegisterResult,
  PointOfSaleClaim,
  PointOfSaleHolder,
  RegisterPointOfSale,
  RegisterPointOfSaleReader,
  RegisterPointOfSaleRecord,
  RegisterPointOfSaleStore,
  RegisterPointOfSaleStoreTransaction,
} from "./register-point-of-sale-store.js";
export { PointOfSaleClaimConflict } from "./register-point-of-sale-store.js";
export type {
  RegularizeOrphanAuthorizationInput,
  RegularizeOrphanAuthorizationOutcome,
} from "./regularize-orphan-authorization.js";
export { regularizeOrphanAuthorization } from "./regularize-orphan-authorization.js";
export type {
  RenewWsaaTokenInput,
  RenewWsaaTokenOutcome,
} from "./renew-wsaa-token.js";
export { renewWsaaToken } from "./renew-wsaa-token.js";
export type {
  FortnightPresentation,
  FortnightPresentationOutcome,
  ReportFortnightsOutcome,
} from "./report-fortnights.js";
export { reportFortnights } from "./report-fortnights.js";
export { reportOfflineAuthorizationCodeAcquisitionFailures } from "./report-offline-authorization-code-acquisition-failures.js";
export type {
  AcquisitionFailureNotice,
  AcquisitionFailureNotifier,
  AcquisitionFailureReportPorts,
  AcquisitionFailureReportStore,
  ReportableAcquisitionFailure,
  ReportableAcquisitionFailureKind,
} from "./report-offline-authorization-code-acquisition-failures-ports.js";
export type {
  RequestRealTimeAuthorizationInput,
  RequestRealTimeAuthorizationOutcome,
} from "./request-real-time-authorization.js";
export { requestRealTimeAuthorization } from "./request-real-time-authorization.js";
export type {
  RequestSaleVoidCreditNoteInput,
  RequestSaleVoidCreditNoteOutcome,
} from "./request-sale-void-credit-note.js";
export { requestSaleVoidCreditNote } from "./request-sale-void-credit-note.js";
export type {
  RequestedCreditNote,
  RequestVoidCreditNotesOutcome,
} from "./request-void-credit-notes.js";
export { requestVoidCreditNotes } from "./request-void-credit-notes.js";
export type {
  CloudCreditNoteCall,
  CloudCreditNotes,
  CreditNotePrinter,
  PendingCreditNote,
  RegisterVoidCreditNotes,
  RequestVoidCreditNotesPorts,
  RequestVoidedSaleCreditNotePorts,
} from "./request-void-credit-notes-ports.js";
export type {
  RequestVoidedSaleCreditNoteInput,
  RequestVoidedSaleCreditNoteOutcome,
} from "./request-voided-sale-credit-note.js";
export { requestVoidedSaleCreditNote } from "./request-voided-sale-credit-note.js";
export type {
  FiscalDocumentReservation,
  IdGenerator,
  SaleAuthorizationTransaction,
  SaleOrigin,
} from "./sale-authorization-ports.js";
export type {
  InvoiceAlreadyCredited,
  RequestSaleVoidCreditNotePorts,
  SaleVoidCreditNoteLane,
  SaleVoidCreditNoteLanes,
  SaleVoidCreditNoteRecord,
} from "./sale-void-credit-note-ports.js";
export { CreditNoteIdTaken, VoucherAlreadyCredited } from "./sale-void-credit-note-ports.js";
export type { SettleInterruptedRealTimeAuthorizationsOutcome } from "./settle-interrupted-real-time-authorizations.js";
export { settleInterruptedRealTimeAuthorizations } from "./settle-interrupted-real-time-authorizations.js";
export type {
  LastAuthorizedAnswer,
  LastAuthorizedCount,
  TaxAuthorityCountPorts,
  TaxAuthorityCounts,
  TaxAuthorityLastAuthorizedLookup,
} from "./tax-authority-count-ports.js";
export type {
  AbandonedRequestRecord,
  AskAboutUnclearOutcomePorts,
  DecideUnclearRealTimeOutcomePorts,
  TaxAuthorityVoucherLookup,
  UnclearOutcomeLane,
  UnclearOutcomeLanes,
  UnclearOutcomeRequests,
  UnclearOutcomeWarningClearance,
  UnclearRequest,
  UnclearRequestProgress,
  VoucherAnswer,
} from "./unclear-outcome-ports.js";
export type {
  WsaaAuthentication,
  WsaaAuthenticationResult,
  WsaaToken,
  WsaaTokenAnswer,
  WsaaTokenPorts,
  WsaaTokenRenewal,
  WsaaTokenStore,
} from "./wsaa-token-ports.js";
