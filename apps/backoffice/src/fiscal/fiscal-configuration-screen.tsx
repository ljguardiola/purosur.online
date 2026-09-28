import { type CalendarDate, parseDate } from "@internationalized/date";
import {
  argentinaCalendarDay,
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "@purosur/domain";
import { Button, DateField, formatDate, InlineNotice, Modal, TextField } from "@purosur/ui";
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
import { useCallback, useEffect, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import {
  fetchIssuerIdentification,
  type IssuerIdentification,
  type IssuerIdentificationField,
  type SaveIssuerIdentificationOutcome,
  saveIssuerIdentification,
} from "./issuer-identification-api";

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
  services?: FiscalConfigurationScreenServices;
  now?: () => Date;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "loadError" }
  | { kind: "loaded"; value: IssuerIdentification };

function dateOf(value: string | null): CalendarDate | null {
  return value === null ? null : parseDate(value);
}

const LEGAL_NAME_TOO_LONG_ERROR = `Ingresá como mucho ${ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH} caracteres.`;
const GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR = `Ingresá como mucho ${ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH} caracteres.`;
const ACTIVITY_START_DATE_FUTURE_ERROR = "La fecha no puede ser futura.";

function todayCalendarDate(now: Date): CalendarDate {
  return parseDate(argentinaCalendarDay(now));
}

function formatDisplayDate(isoDate: string): string {
  return formatDate(Date.parse(isoDate), {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function dataPair(label: string, value: string | null) {
  return (
    <div className="flex flex-col gap-1" key={label}>
      <p className="font-bold text-text-subtle text-detail">{label}</p>
      <p
        className={
          value === null
            ? "font-normal text-body text-text-subtle"
            : "font-semibold text-body text-text"
        }
      >
        {value ?? "Sin cargar"}
      </p>
    </div>
  );
}

function fixedPair(label: string, value: string) {
  return (
    <div className="flex flex-col gap-1" key={label}>
      <p className="font-bold text-text-subtle text-detail">{label}</p>
      <p className="font-semibold text-body text-text">{value}</p>
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

function validateModal(values: ModalValues, today: CalendarDate): ModalValidation {
  const errors: FieldErrors = {};
  const legalName = values.legalName.trim();
  if (!legalName) {
    errors.legalName = "Ingresá la razón social.";
  } else if (isIssuerIdentificationLegalNameTooLong(legalName)) {
    errors.legalName = LEGAL_NAME_TOO_LONG_ERROR;
  }
  const grossIncomeRegistration = values.grossIncomeRegistration.trim();
  if (!grossIncomeRegistration) {
    errors.grossIncomeRegistration = "Ingresá el número de Ingresos Brutos.";
  } else if (isIssuerIdentificationGrossIncomeRegistrationTooLong(grossIncomeRegistration)) {
    errors.grossIncomeRegistration = GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR;
  }
  const activityStartDate = values.activityStartDate;
  if (activityStartDate === null) {
    errors.activityStartDate = "Elegí la fecha de inicio de actividades.";
  } else if (activityStartDate.compare(today) > 0) {
    errors.activityStartDate = ACTIVITY_START_DATE_FUTURE_ERROR;
  }
  if (activityStartDate === null || Object.keys(errors).length > 0) {
    return { kind: "invalid", errors };
  }
  return { kind: "valid", values: { legalName, grossIncomeRegistration, activityStartDate } };
}

/** `version` never maps to a field error here: a stale version already has its own notice. */
function serverFieldErrors(field: IssuerIdentificationField): FieldErrors | undefined {
  if (field === "legal_name") {
    return { legalName: LEGAL_NAME_TOO_LONG_ERROR };
  }
  if (field === "gross_income_registration") {
    return { grossIncomeRegistration: GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR };
  }
  if (field === "activity_start_date") {
    return { activityStartDate: ACTIVITY_START_DATE_FUTURE_ERROR };
  }
  return undefined;
}

type EditIssuerIdentificationModalProps = {
  target: IssuerIdentification | null;
  onClose: () => void;
  onSaved: (value: IssuerIdentification) => void;
  onReloaded: (value: IssuerIdentification) => void;
  onSessionEnded: () => void;
  services: FiscalConfigurationScreenServices;
  now: () => Date;
};

// CUIT and tax status are always plain text, never editable: both come from the tax authority.
// The other three fields are required, since the incomplete state only exists before the first save.
function EditIssuerIdentificationModal({
  target,
  onClose,
  onSaved,
  onReloaded,
  onSessionEnded,
  services,
  now,
}: EditIssuerIdentificationModalProps) {
  const sendToMyAccount = useSendToMyAccount();
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
    actionName: "Guardar la identificación del emisor",
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
        context="CONFIGURACIÓN FISCAL"
        title="Identificación del emisor"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={submitting}
              onPress={onClose}
            >
              Cancelar
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
                Recargar
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
                Guardar los cambios
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
                title="No se pudo guardar el cambio"
                detail="Probá de nuevo."
              />
            )}
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title="La identificación del emisor cambió mientras la editabas"
                detail="Recargá los datos y volvé a hacer el cambio."
              />
            )}
            {notice?.kind === "reloadFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudieron recargar los datos"
                detail="Probá de nuevo."
              />
            )}
            <div className="flex gap-8">
              {fixedPair("CUIT", target.authorizedCuit)}
              {fixedPair("Condición frente al IVA", target.taxStatus)}
            </div>
            <TextField
              kind="plain-text"
              label="Razón social"
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
                  label="Ingresos Brutos"
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
                  label="Inicio de actividades"
                  value={values.activityStartDate}
                  onChange={(value) => {
                    setValues((current) => ({ ...current, activityStartDate: value }));
                    clearFieldError("activityStartDate");
                  }}
                  required
                  maxValue={todayCalendarDate(now())}
                  rangeMessage={ACTIVITY_START_DATE_FUTURE_ERROR}
                  {...activityStartDateValidity}
                />
              </div>
            </div>
            <InlineNotice
              tone="info"
              icon={<Info />}
              detail="Los comprobantes ya emitidos conservan los datos con los que se imprimieron."
            />
          </div>
        )}
      </Modal>
      {modal}
    </>
  );
}

export function FiscalConfigurationScreen({
  onSessionEnded,
  services,
  now,
}: FiscalConfigurationScreenProps) {
  const sendToMyAccount = useSendToMyAccount();
  const svc = services ?? defaultFiscalConfigurationScreenServices;
  const clock = now ?? (() => new Date());
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [editing, setEditing] = useState(false);

  const onSessionEndedRef = useLatestRef(onSessionEnded);
  const endSession = useCallback(() => onSessionEndedRef.current(), [onSessionEndedRef]);

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
  }, [svc.fetchIssuerIdentification, endSession, sendToMyAccount]);

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
        <div className="flex h-18 shrink-0 items-center border-border border-b bg-surface px-8">
          <div className="flex flex-col justify-center">
            <p className="text-text-subtle text-detail">Caja y fiscal · Fiscal</p>
            <ScreenTitle>Configuración fiscal</ScreenTitle>
          </div>
        </div>
      }
      bodyClassName="gap-4 p-6"
    >
      {state.kind === "loading" && <p role="status">Cargando…</p>}
      {state.kind === "loadError" && (
        <>
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No pudimos abrir la configuración fiscal"
            detail="Probá de nuevo en unos minutos."
          />
          <Button variant="secondary" onPress={() => void load()}>
            Reintentar
          </Button>
        </>
      )}
      {state.kind === "loaded" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-bold text-text-accent text-subheading">
              Identificación del emisor
            </h2>
            <Button
              variant="secondary"
              size="small"
              icon={<Pencil />}
              onPress={() => setEditing(true)}
            >
              Editar
            </Button>
          </div>
          {incomplete && (
            <InlineNotice
              tone="error"
              icon={<CircleAlert />}
              title="Las cajas no están emitiendo facturas ni notas de crédito"
              detail="Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando."
            />
          )}
          <div className="flex gap-8">
            {dataPair("Razón social", state.value.legalName)}
            {fixedPair("CUIT", state.value.authorizedCuit)}
            {fixedPair("Condición frente al IVA", state.value.taxStatus)}
            {dataPair("Ingresos Brutos", state.value.grossIncomeRegistration)}
            {dataPair(
              "Inicio de actividades",
              state.value.activityStartDate
                ? formatDisplayDate(state.value.activityStartDate)
                : null,
            )}
          </div>
          <p className="font-normal text-text-subtle text-detail">
            Lo imprime cada factura y nota de crédito.
          </p>
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
