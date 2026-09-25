import { type CalendarDate, parseDate } from "@internationalized/date";
import {
  argentinaCalendarDay,
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "@purosur/contracts";
import { Button, DateField, InlineNotice, Modal, TextField } from "@purosur/ui";
import { startAuthentication } from "@simplewebauthn/browser";
import {
  Check,
  CircleAlert,
  Info,
  Landmark,
  Pencil,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuthorization } from "./AuthorizationModal";
import {
  fetchIssuerIdentification,
  type IssuerIdentification,
  type IssuerIdentificationField,
  type SaveIssuerIdentificationOutcome,
  saveIssuerIdentification,
} from "./issuerIdentificationApi";
import { messages } from "./messages";
import { ScreenLayout } from "./ScreenLayout";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";
import { sendToMyAccount } from "./settingsRoutes";

export type FiscalConfigurationScreenServices = {
  fetchIssuerIdentification: typeof fetchIssuerIdentification;
  saveIssuerIdentification: typeof saveIssuerIdentification;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultFiscalConfigurationScreenServices: FiscalConfigurationScreenServices = {
  fetchIssuerIdentification,
  saveIssuerIdentification,
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

export type FiscalConfigurationScreenProps = {
  onSessionEnded: () => void;
  /** Injected in tests so the screen doesn't call the real API or WebAuthn. */
  services?: FiscalConfigurationScreenServices;
  /** Injected in tests so "today" for the activity start date is deterministic. */
  now?: () => Date;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "loaded"; value: IssuerIdentification };

const cashMessages = messages.cash;
const pageMessages = cashMessages.fiscalConfiguration;
const issuerMessages = pageMessages.issuerIdentification;
const modalMessages = pageMessages.editIssuerIdentificationModal;

function dateOf(value: string | null): CalendarDate | null {
  return value === null ? null : parseDate(value);
}

function todayCalendarDate(now: Date): CalendarDate {
  return parseDate(argentinaCalendarDay(now));
}

function formatDisplayDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

function dataPair(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1" key={label}>
      <p className="font-bold text-ink-secondary text-sm">{label}</p>
      <p
        className={
          value === null
            ? "font-normal text-base text-ink-secondary"
            : "font-semibold text-base text-ink"
        }
      >
        {value ?? issuerMessages.notLoaded}
      </p>
    </div>
  );
}

function fixedPair(label: string, value: string) {
  return (
    <div className="flex flex-col gap-1" key={label}>
      <p className="font-bold text-ink-secondary text-sm">{label}</p>
      <p className="font-semibold text-base text-ink">{value}</p>
    </div>
  );
}

type FieldErrorKey = "legalName" | "grossIncomeRegistration" | "activityStartDate";
type FieldErrors = Partial<Record<FieldErrorKey, string>>;

type ModalNotice = { kind: "attemptFailed" } | { kind: "staleVersion" } | { kind: "reloadFailed" };

type ModalValues = {
  legalName: string;
  grossIncomeRegistration: string;
  activityStartDate: CalendarDate | null;
};

const EMPTY_MODAL_VALUES: ModalValues = {
  legalName: "",
  grossIncomeRegistration: "",
  activityStartDate: null,
};

function valuesFrom(value: IssuerIdentification): ModalValues {
  return {
    legalName: value.legalName ?? "",
    grossIncomeRegistration: value.grossIncomeRegistration ?? "",
    activityStartDate: dateOf(value.activityStartDate),
  };
}

type CompleteModalValues = {
  legalName: string;
  grossIncomeRegistration: string;
  activityStartDate: CalendarDate;
};

type ModalValidation =
  | { kind: "valid"; values: CompleteModalValues }
  | { kind: "invalid"; errors: FieldErrors };

/** Validates every field client-side, mirroring the server (`issuer-identification-validation.ts`):
 * all three are required, and the activity start date can never be in the future. */
function validateModal(values: ModalValues, today: CalendarDate): ModalValidation {
  const errors: FieldErrors = {};
  const legalName = values.legalName.trim();
  if (!legalName) {
    errors.legalName = modalMessages.legalNameRequired;
  } else if (legalName.length > ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH) {
    errors.legalName = modalMessages.legalNameTooLong;
  }
  const grossIncomeRegistration = values.grossIncomeRegistration.trim();
  if (!grossIncomeRegistration) {
    errors.grossIncomeRegistration = modalMessages.grossIncomeRegistrationRequired;
  } else if (
    grossIncomeRegistration.length > ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH
  ) {
    errors.grossIncomeRegistration = modalMessages.grossIncomeRegistrationTooLong;
  }
  const activityStartDate = values.activityStartDate;
  if (activityStartDate === null) {
    errors.activityStartDate = modalMessages.activityStartDateRequired;
  } else if (activityStartDate.compare(today) > 0) {
    errors.activityStartDate = modalMessages.activityStartDateFuture;
  }
  if (activityStartDate === null || Object.keys(errors).length > 0) {
    return { kind: "invalid", errors };
  }
  return { kind: "valid", values: { legalName, grossIncomeRegistration, activityStartDate } };
}

/** The field's own error for a save the server rejected on it; `version` never renders inline
 * (a stale version already has its own notice). */
function serverFieldErrors(field: IssuerIdentificationField): FieldErrors | undefined {
  if (field === "legal_name") {
    return { legalName: modalMessages.legalNameTooLong };
  }
  if (field === "gross_income_registration") {
    return { grossIncomeRegistration: modalMessages.grossIncomeRegistrationTooLong };
  }
  if (field === "activity_start_date") {
    return { activityStartDate: modalMessages.activityStartDateFuture };
  }
  return undefined;
}

type EditIssuerIdentificationModalProps = {
  target: IssuerIdentification | null;
  onClose: () => void;
  onSaved: (value: IssuerIdentification) => void;
  /** Receives a fresh load after a stale save; the new `target` it produces re-seeds the modal. */
  onReloaded: (value: IssuerIdentification) => void;
  onSessionEnded: () => void;
  services: FiscalConfigurationScreenServices;
  now: () => Date;
};

/**
 * "Editar la identificación del emisor": the CUIT and tax status are always shown as plain text,
 * never editable, since both come from the tax authority; the other three fields are required,
 * since the incomplete state only exists before the first save. Saving is gated by the shared
 * passkey-authorization window, the same way `RoleEditorModal` is.
 */
function EditIssuerIdentificationModal({
  target,
  onClose,
  onSaved,
  onReloaded,
  onSessionEnded,
  services,
  now,
}: EditIssuerIdentificationModalProps) {
  const {
    fetchIssuerIdentification,
    saveIssuerIdentification,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const isOpen = target !== null;
  const [values, setValues] = useState<ModalValues>(EMPTY_MODAL_VALUES);
  const [version, setVersion] = useState(1);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const { run, modal } = useAuthorization<SaveIssuerIdentificationOutcome>({
    action: "issuerIdentificationSave",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  useEffect(() => {
    if (isOpen && target) {
      setValues(valuesFrom(target));
      setVersion(target.version);
      setErrors({});
      setNotice(null);
      setSubmitting(false);
    }
  }, [isOpen, target]);

  function clearFieldError(field: FieldErrorKey) {
    if (!errors[field]) {
      return;
    }
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit() {
    if (target === null) {
      return;
    }
    const validation = validateModal(values, todayCalendarDate(now()));
    if (validation.kind === "invalid") {
      setErrors(validation.errors);
      return;
    }
    setErrors({});
    setNotice(null);
    setSubmitting(true);

    const { legalName, grossIncomeRegistration, activityStartDate } = validation.values;
    const outcome = await run(() =>
      saveIssuerIdentification({
        legalName,
        grossIncomeRegistration,
        activityStartDate: activityStartDate.toString(),
        version,
      }),
    );
    if (outcome.kind === "cancelled") {
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "ok") {
      onSaved(outcome.value);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "stale_version") {
      setNotice({ kind: "staleVersion" });
      setSubmitting(false);
      return;
    }
    if (outcome.kind === "validation_failed") {
      const fieldErrors = serverFieldErrors(outcome.field);
      if (fieldErrors) {
        setErrors((current) => ({ ...current, ...fieldErrors }));
      } else {
        setNotice({ kind: "attemptFailed" });
      }
      setSubmitting(false);
      return;
    }
    setNotice({ kind: "attemptFailed" });
    setSubmitting(false);
  }

  async function handleReload() {
    setSubmitting(true);
    const outcome = await fetchIssuerIdentification();
    if (outcome.kind === "ok") {
      onReloaded(outcome.value);
      return;
    }
    if (outcome.kind === "unauthenticated") {
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      sendToMyAccount();
      return;
    }
    setNotice({ kind: "reloadFailed" });
    setSubmitting(false);
  }

  const offersReload = notice?.kind === "staleVersion" || notice?.kind === "reloadFailed";
  const activityStartDateValidity: { invalid: true; errorMessage: string } | { invalid?: false } =
    errors.activityStartDate ? { invalid: true, errorMessage: errors.activityStartDate } : {};

  return (
    <>
      <Modal
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Landmark />}
        context={modalMessages.eyebrow}
        title={modalMessages.title}
        closable
        closeLabel={modalMessages.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              {modalMessages.cancel}
            </Button>
            {offersReload ? (
              <Button
                variant="primary"
                size="large"
                icon={<RotateCcw />}
                fullWidth
                isDisabled={submitting}
                onPress={() => void handleReload()}
              >
                {modalMessages.reload}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="large"
                icon={<Check />}
                fullWidth
                isDisabled={submitting}
                onPress={() => void handleSubmit()}
              >
                {modalMessages.submit}
              </Button>
            )}
          </>
        }
      >
        {target && (
          <div className="flex flex-col gap-4">
            {notice?.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={modalMessages.attemptFailedTitle}
                detail={modalMessages.attemptFailedDetail}
              />
            )}
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title={modalMessages.staleVersionTitle}
                detail={modalMessages.staleVersionDetail}
              />
            )}
            {notice?.kind === "reloadFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title={modalMessages.reloadFailedTitle}
                detail={modalMessages.attemptFailedDetail}
              />
            )}
            <div className="flex gap-8">
              {fixedPair(modalMessages.cuitLabel, target.authorizedCuit)}
              {fixedPair(modalMessages.taxStatusLabel, target.taxStatus)}
            </div>
            <TextField
              kind="plain-text"
              variant="backoffice"
              label={modalMessages.legalNameLabel}
              value={values.legalName}
              onChange={(value) => {
                setValues((current) => ({ ...current, legalName: value }));
                clearFieldError("legalName");
              }}
              required
              {...(errors.legalName ? { invalid: true, errorMessage: errors.legalName } : {})}
            />
            <div className="flex gap-3">
              <div className="flex-1">
                <TextField
                  kind="plain-text"
                  variant="backoffice"
                  label={modalMessages.grossIncomeRegistrationLabel}
                  value={values.grossIncomeRegistration}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, grossIncomeRegistration: value }));
                    clearFieldError("grossIncomeRegistration");
                  }}
                  required
                  {...(errors.grossIncomeRegistration
                    ? { invalid: true, errorMessage: errors.grossIncomeRegistration }
                    : {})}
                />
              </div>
              <div className="flex-1">
                <DateField
                  variant="backoffice"
                  label={modalMessages.activityStartDateLabel}
                  value={values.activityStartDate}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, activityStartDate: value }));
                    clearFieldError("activityStartDate");
                  }}
                  required
                  maxValue={todayCalendarDate(now())}
                  rangeMessage={modalMessages.activityStartDateFuture}
                  {...activityStartDateValidity}
                />
              </div>
            </div>
            <InlineNotice tone="info" icon={<Info />} detail={modalMessages.printedNotice} />
          </div>
        )}
      </Modal>
      {modal}
    </>
  );
}

/**
 * "Configuración fiscal": today, only the business-wide issuer identification, reserved to
 * `change_fiscal_configuration` (an Administrator always holds it implicitly) the same way
 * `BranchSettingsScreen` is reserved to `configure_branch`. The threshold and clock-correction
 * sections the design also draws for this screen belong to #44/#55, not built here.
 */
export function FiscalConfigurationScreen({
  onSessionEnded,
  services,
  now,
}: FiscalConfigurationScreenProps) {
  const svc = services ?? defaultFiscalConfigurationScreenServices;
  const clock = now ?? (() => new Date());
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [editing, setEditing] = useState(false);

  const onSessionEndedRef = useRef(onSessionEnded);
  onSessionEndedRef.current = onSessionEnded;
  const endSession = useCallback(() => onSessionEndedRef.current(), []);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    const outcome = await svc.fetchIssuerIdentification();
    if (outcome.kind === "ok") {
      setState({ kind: "loaded", value: outcome.value });
    } else if (outcome.kind === "unauthenticated") {
      endSession();
    } else if (outcome.kind === "forbidden") {
      sendToMyAccount();
    } else {
      setState({ kind: "loadError" });
    }
  }, [svc.fetchIssuerIdentification, endSession]);

  useEffect(() => {
    void load();
  }, [load]);

  const incomplete =
    state.kind === "loaded" &&
    (state.value.legalName === null ||
      state.value.grossIncomeRegistration === null ||
      state.value.activityStartDate === null);

  return (
    <ScreenLayout
      topBar={
        <div className="flex h-18 shrink-0 items-center border-line border-b bg-surface-white px-8">
          <div className="flex flex-col justify-center">
            <p className="text-ink-secondary text-sm">{pageMessages.breadcrumb}</p>
            <h1 className="font-bold text-2xl text-brand-blue-strong">{pageMessages.heading}</h1>
          </div>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {state.kind === "loading" && <p role="status">{pageMessages.loading}</p>}
      {state.kind === "loadError" && (
        <>
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={pageMessages.loadErrorTitle}
            detail={pageMessages.loadErrorDetail}
          />
          <Button variant="secondary" onPress={() => void load()}>
            {pageMessages.retry}
          </Button>
        </>
      )}
      {state.kind === "loaded" && (
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-white p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-bold text-brand-blue-strong text-lg">
              {issuerMessages.heading}
            </h2>
            <Button
              variant="secondary"
              size="small"
              icon={<Pencil />}
              onPress={() => setEditing(true)}
            >
              {issuerMessages.edit}
            </Button>
          </div>
          {incomplete && (
            <InlineNotice
              tone="error"
              icon={<CircleAlert />}
              title={issuerMessages.incompleteTitle}
              detail={issuerMessages.incompleteDetail}
            />
          )}
          <div className="flex gap-8">
            {dataPair(issuerMessages.legalNameLabel, state.value.legalName)}
            {fixedPair(issuerMessages.cuitLabel, state.value.authorizedCuit)}
            {fixedPair(issuerMessages.taxStatusLabel, state.value.taxStatus)}
            {dataPair(
              issuerMessages.grossIncomeRegistrationLabel,
              state.value.grossIncomeRegistration,
            )}
            {dataPair(
              issuerMessages.activityStartDateLabel,
              state.value.activityStartDate
                ? formatDisplayDate(state.value.activityStartDate)
                : null,
            )}
          </div>
          <p className="font-normal text-ink-secondary text-sm">{issuerMessages.printedNotice}</p>
        </div>
      )}
      <EditIssuerIdentificationModal
        target={editing && state.kind === "loaded" ? state.value : null}
        onClose={() => setEditing(false)}
        onSaved={(value) => {
          setState({ kind: "loaded", value });
          setEditing(false);
        }}
        onReloaded={(value) => setState({ kind: "loaded", value })}
        onSessionEnded={endSession}
        services={svc}
        now={clock}
      />
    </ScreenLayout>
  );
}
