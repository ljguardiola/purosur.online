import { type CalendarDate, parseDate } from "@internationalized/date";
import { issuerIdentificationEditBodySchema } from "@purosur/contracts";
import {
  argentinaCalendarDay,
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "@purosur/domain";
import {
  Button,
  formatDate,
  InlineNotice,
  LoadFailure,
  LoadingPlaceholder,
  Modal,
} from "@purosur/ui";
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
import { useEffect, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import { useCloudForm } from "../platform/cloud-form";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { useLatestRef } from "../platform/use-latest-ref";
import { ScreenLayout } from "../shell/screen-layout";
import { ScreenTitle } from "../shell/screen-title";
import type { FiscalConfigurationScreenServices } from "./fiscal-configuration-services";
import { useIssuerIdentificationQuery, useReloadIssuerIdentification } from "./fiscal-queries";
import type {
  IssuerIdentification,
  SaveIssuerIdentificationOutcome,
} from "./issuer-identification-api";

export type FiscalConfigurationScreenProps = {
  onSessionEnded: () => void;
  services: FiscalConfigurationScreenServices;
  now?: () => Date;
};

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
          value === null ? "text-body text-text-subtle" : "font-semibold text-body text-text"
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

type ModalNotice = { kind: "attemptFailed" } | { kind: "staleVersion" };

type ModalValues = {
  legalName: string;
  grossIncomeRegistration: string;
  activityStartDate: CalendarDate | null;
  version: number;
};

const EMPTY_MODAL_VALUES: ModalValues = {
  legalName: "",
  grossIncomeRegistration: "",
  activityStartDate: null,
  version: 0,
};

function valuesFrom(value: IssuerIdentification): ModalValues {
  return {
    legalName: value.legalName ?? "",
    grossIncomeRegistration: value.grossIncomeRegistration ?? "",
    activityStartDate: dateOf(value.activityStartDate),
    version: value.version,
  };
}

function legalNameMessage({ legalName }: ModalValues): string {
  return legalName.trim() === "" ? "Ingresá la razón social." : LEGAL_NAME_TOO_LONG_ERROR;
}

function grossIncomeRegistrationMessage({ grossIncomeRegistration }: ModalValues): string {
  return grossIncomeRegistration.trim() === ""
    ? "Ingresá el número de Ingresos Brutos."
    : GROSS_INCOME_REGISTRATION_TOO_LONG_ERROR;
}

function activityStartDateMessage({ activityStartDate }: ModalValues): string {
  return activityStartDate === null
    ? "Elegí la fecha de inicio de actividades."
    : ACTIVITY_START_DATE_FUTURE_ERROR;
}

type EditIssuerIdentificationModalProps = {
  target: IssuerIdentification | null;
  onClose: () => void;
  onSaved: () => void;
  reload: () => Promise<CloudReadOutcome<IssuerIdentification>>;
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
  reload,
  onSessionEnded,
  services,
  now,
}: EditIssuerIdentificationModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    saveIssuerIdentification,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<IssuerIdentification | null>(null);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const [openedAt, setOpenedAt] = useState(now);
  const nowRef = useLatestRef(now);
  const { run, modal } = useAuthorization<SaveIssuerIdentificationOutcome>({
    actionName: "Guardar la identificación del emisor",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, dirty, reset } = useCloudForm({
    defaultValues: EMPTY_MODAL_VALUES,
    request: {
      schema: issuerIdentificationEditBodySchema(openedAt),
      from: ({ legalName, grossIncomeRegistration, activityStartDate, version }) => ({
        legal_name: legalName.trim(),
        gross_income_registration: grossIncomeRegistration.trim(),
        activity_start_date: activityStartDate?.toString() ?? "",
        version,
      }),
    },
    fields: {
      legal_name: "legalName",
      gross_income_registration: "grossIncomeRegistration",
      activity_start_date: "activityStartDate",
      version: null,
    },
    messages: {
      legalName: legalNameMessage,
      grossIncomeRegistration: grossIncomeRegistrationMessage,
      activityStartDate: activityStartDateMessage,
    },
    onSubmit: async (request, { showWireFieldError }) => {
      setNotice(null);
      const outcome = await run(() => saveIssuerIdentification(request));
      if (outcome.kind === "cancelled") {
        return;
      }
      if (outcome.kind === "ok") {
        await reload();
        onSaved();
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
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (open) {
      setOpenedAt(nowRef.current());
    }
  }, [open, nowRef]);

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(valuesFrom(target));
      setSeededFrom(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleReload() {
    setReloading(true);
    const outcome = await reload();
    if (outcome.kind === "ok") {
      reset(valuesFrom(outcome.value));
      setSeededFrom(outcome.value);
      setNotice(null);
    }
    setReloading(false);
  }

  const busy = submitting || reloading;
  const offersReload = notice?.kind === "staleVersion";

  return (
    <>
      <Modal
        open={open}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
        width="standard"
        tone="info"
        icon={<Landmark />}
        context="Configuración fiscal"
        title="Identificación del emisor"
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            {offersReload ? (
              <Button
                variant="primary"
                size="large"
                icon={<RotateCcw />}
                fullWidth
                disabled={busy}
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
                disabled={busy}
                onPress={() => void submit()}
              >
                Guardar los cambios
              </Button>
            )}
          </>
        }
      >
        {target ? (
          <div className="flex flex-col gap-4">
            {notice?.kind === "attemptFailed" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="No se pudo guardar el cambio"
                description="Probá de nuevo."
              />
            )}
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title="La identificación del emisor cambió mientras la editabas"
                description="Recargá los datos y volvé a hacer el cambio."
              />
            )}
            <div className="flex gap-8">
              {fixedPair("CUIT", target.authorizedCuit)}
              {fixedPair("Condición frente al IVA", target.taxStatus)}
            </div>
            <form.AppField name="legalName">
              {(field) => <field.TextField kind="plain-text" label="Razón social" required />}
            </form.AppField>
            <div className="flex gap-3">
              <div className="flex-1">
                <form.AppField name="grossIncomeRegistration">
                  {(field) => (
                    <field.TextField kind="plain-text" label="Ingresos Brutos" required />
                  )}
                </form.AppField>
              </div>
              <div className="flex-1">
                <form.AppField name="activityStartDate">
                  {(field) => (
                    <field.DateField
                      label="Inicio de actividades"
                      required
                      maxValue={todayCalendarDate(openedAt)}
                      rangeMessage={ACTIVITY_START_DATE_FUTURE_ERROR}
                    />
                  )}
                </form.AppField>
              </div>
            </div>
            <InlineNotice
              tone="info"
              icon={<Info />}
              description="Los comprobantes ya emitidos conservan los datos con los que se imprimieron."
            />
          </div>
        ) : null}
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
  const { fetchIssuerIdentification } = services;
  const clock = now ?? (() => new Date());
  const data = useIssuerIdentificationQuery({ fetchIssuerIdentification, onSessionEnded });
  const reload = useReloadIssuerIdentification({ fetchIssuerIdentification });
  const [editing, setEditing] = useState(false);
  if (editing && data.status === "failed") {
    setEditing(false);
  }

  const issuerIdentification = data.status === "loaded" ? data.value : null;
  const incomplete =
    issuerIdentification !== null &&
    (issuerIdentification.legalName === null ||
      issuerIdentification.grossIncomeRegistration === null ||
      issuerIdentification.activityStartDate === null);

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
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center gap-3">
          <h2 className="flex-1 text-text-accent text-subheading">Identificación del emisor</h2>
          <Button
            variant="secondary"
            size="small"
            icon={<Pencil />}
            dataStatus={data.status}
            onPress={() => setEditing(true)}
          >
            Editar
          </Button>
        </div>
        {data.status === "loading" && <LoadingPlaceholder variant="form" fields={2} />}
        {data.status === "failed" && (
          <LoadFailure {...cloudLoadFailure(data, "la configuración fiscal")} />
        )}
        {issuerIdentification !== null && (
          <>
            {incomplete ? (
              <InlineNotice
                tone="error"
                icon={<CircleAlert />}
                title="Las cajas no están emitiendo facturas ni notas de crédito"
                description="Hasta que se carguen los datos que faltan. Las ventas se siguen cobrando."
              />
            ) : null}
            <div className="flex gap-8">
              {dataPair("Razón social", issuerIdentification.legalName)}
              {fixedPair("CUIT", issuerIdentification.authorizedCuit)}
              {fixedPair("Condición frente al IVA", issuerIdentification.taxStatus)}
              {dataPair("Ingresos Brutos", issuerIdentification.grossIncomeRegistration)}
              {dataPair(
                "Inicio de actividades",
                issuerIdentification.activityStartDate
                  ? formatDisplayDate(issuerIdentification.activityStartDate)
                  : null,
              )}
            </div>
            <p className="text-text-subtle text-detail">
              Lo imprime cada factura y nota de crédito.
            </p>
          </>
        )}
      </div>
      <EditIssuerIdentificationModal
        target={editing ? issuerIdentification : null}
        onClose={() => setEditing(false)}
        onSaved={() => setEditing(false)}
        reload={reload}
        onSessionEnded={onSessionEnded}
        services={services}
        now={clock}
      />
    </ScreenLayout>
  );
}
