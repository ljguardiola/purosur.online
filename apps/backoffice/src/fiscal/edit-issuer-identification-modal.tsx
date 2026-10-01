import { issuerIdentificationEditBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Info, Landmark, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";
import { useAuthorization } from "../access/authorization-modal";
import { useSendToMyAccount } from "../access/send-to-my-account";
import type { authorizeSession, fetchSessionAuthorizationOptions } from "../access/session-api";
import { useCloudForm } from "../platform/cloud-form";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { FixedPair } from "./fiscal-data-pair";
import type {
  IssuerIdentification,
  SaveIssuerIdentificationOutcome,
  saveIssuerIdentification,
} from "./issuer-identification-api";
import {
  ACTIVITY_START_DATE_FUTURE_ERROR,
  activityStartDateMessage,
  EMPTY_ISSUER_IDENTIFICATION_FORM,
  grossIncomeRegistrationMessage,
  issuerIdentificationFormValuesFrom,
  issuerIdentificationRequestFrom,
  latestActivityStartDate,
  legalNameMessage,
} from "./issuer-identification-form";

export type EditIssuerIdentificationModalServices = {
  saveIssuerIdentification: typeof saveIssuerIdentification;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ModalNotice = { kind: "attemptFailed" } | { kind: "staleVersion" };

type EditIssuerIdentificationModalProps = {
  target: IssuerIdentification | null;
  onClose: () => void;
  onSaved: () => void;
  reload: () => Promise<CloudReadOutcome<IssuerIdentification>>;
  onSessionEnded: () => void;
  services: EditIssuerIdentificationModalServices;
  now: () => Date;
};

// CUIT and tax status are always plain text, never editable: both come from the tax authority.
// The other three fields are required, since the incomplete state only exists before the first save.
export function EditIssuerIdentificationModal({
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
  const { run, modal } = useAuthorization<SaveIssuerIdentificationOutcome>({
    actionName: "Guardar la identificación del emisor",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, dirty, reset } = useCloudForm({
    defaultValues: EMPTY_ISSUER_IDENTIFICATION_FORM,
    request: {
      schema: issuerIdentificationEditBodySchema(openedAt),
      from: issuerIdentificationRequestFrom,
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
      activityStartDate: activityStartDateMessage(openedAt),
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

  const readNow = useEffectEvent(now);

  useEffect(() => {
    if (open) {
      setOpenedAt(readNow());
    }
  }, [open]);

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(issuerIdentificationFormValuesFrom(target));
      setSeededFrom(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleReload() {
    setReloading(true);
    const outcome = await reload();
    if (outcome.kind === "ok") {
      reset(issuerIdentificationFormValuesFrom(outcome.value));
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
              <FixedPair label="CUIT" value={target.authorizedCuit} />
              <FixedPair label="Condición frente al IVA" value={target.taxStatus} />
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
                      maxValue={latestActivityStartDate(openedAt)}
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
