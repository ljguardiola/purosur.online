import { offlinePointOfSaleConfigurationBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Info, Landmark, RotateCcw, ShieldX, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuthorization } from "../platform/authorization-modal";
import type { CloudReadOutcome } from "../platform/cloud-read-outcome";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { useSendToMyAccount } from "../platform/send-to-my-account";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  EMPTY_OFFLINE_POINT_OF_SALE_FORM,
  offlinePointOfSaleFormValuesFrom,
  offlinePointOfSaleRequestFrom,
  pointOfSaleNumberMessage,
} from "./register-point-of-sale-form";
import type {
  ConfigureRegisterPointOfSaleOutcome,
  configureRegisterOfflinePointOfSale,
  RegisterPointOfSale,
} from "./register-points-of-sale-api";

export type EditRegisterOfflinePointOfSaleModalServices = {
  configureRegisterOfflinePointOfSale: typeof configureRegisterOfflinePointOfSale;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type ModalNotice =
  | { kind: "attemptFailed" }
  | { kind: "staleVersion" }
  | { kind: "realTimeMissing" }
  | { kind: "rateLimited"; retryAfterSeconds: number };

type EditRegisterOfflinePointOfSaleModalProps = {
  target: RegisterPointOfSale | null;
  onClose: () => void;
  onSaved: () => void;
  reload: () => Promise<CloudReadOutcome<RegisterPointOfSale[]>>;
  onSessionEnded: () => void;
  services: EditRegisterOfflinePointOfSaleModalServices;
};

export function EditRegisterOfflinePointOfSaleModal({
  target,
  onClose,
  onSaved,
  reload,
  onSessionEnded,
  services,
}: EditRegisterOfflinePointOfSaleModalProps) {
  const sendToMyAccount = useSendToMyAccount();
  const {
    configureRegisterOfflinePointOfSale,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const [seededFrom, setSeededFrom] = useState<RegisterPointOfSale | null>(null);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [reloading, setReloading] = useState(false);
  const { run, modal } = useAuthorization<ConfigureRegisterPointOfSaleOutcome>({
    actionName: "Guardar el punto de venta",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, dirty, reset } = useRequestForm({
    defaultValues: EMPTY_OFFLINE_POINT_OF_SALE_FORM,
    request: {
      schema: offlinePointOfSaleConfigurationBodySchema,
      from: offlinePointOfSaleRequestFrom,
    },
    fields: {
      point_of_sale_number: "pointOfSaleNumber",
      version: null,
    },
    messages: {
      pointOfSaleNumber: pointOfSaleNumberMessage,
    },
    onSubmit: async (request, { showWireFieldError, showFieldError }) => {
      if (target === null) {
        return;
      }
      setNotice(null);
      const outcome = await run(() =>
        configureRegisterOfflinePointOfSale(target.registerId, request),
      );
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
      if (outcome.kind === "not_found") {
        await reload();
        return;
      }
      if (outcome.kind === "point_of_sale_taken") {
        showFieldError("pointOfSaleNumber", "Ese punto de venta ya está asignado.");
        return;
      }
      if (outcome.kind === "real_time_point_of_sale_missing") {
        setNotice({ kind: "realTimeMissing" });
        return;
      }
      if (outcome.kind === "stale_version") {
        setNotice({ kind: "staleVersion" });
        return;
      }
      if (outcome.kind === "validation_failed" && showWireFieldError(outcome.field)) {
        return;
      }
      if (outcome.kind === "rate_limited") {
        setNotice({ kind: "rateLimited", retryAfterSeconds: outcome.retryAfterSeconds });
        return;
      }
      setNotice({ kind: "attemptFailed" });
    },
  });

  useEffect(() => {
    if (target === null) {
      if (seededFrom !== null) {
        reset();
        setSeededFrom(null);
      }
    } else if (target !== seededFrom && !dirty) {
      reset(offlinePointOfSaleFormValuesFrom(target));
      setSeededFrom(target);
      setNotice(null);
    }
  }, [target, seededFrom, dirty, reset]);

  async function handleReload() {
    if (target === null) {
      return;
    }
    setReloading(true);
    const outcome = await reload();
    const reloaded =
      outcome.kind === "ok"
        ? outcome.value.find(({ registerId }) => registerId === target.registerId)
        : undefined;
    if (reloaded !== undefined) {
      reset(offlinePointOfSaleFormValuesFrom(reloaded));
      setSeededFrom(reloaded);
      setNotice(null);
    }
    setReloading(false);
  }

  const busy = submitting || reloading;

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
        context="Punto de venta CAEA"
        title={target?.registerName ?? ""}
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            {notice?.kind === "staleVersion" ? (
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
            {notice?.kind === "rateLimited" && (
              <InlineNotice
                tone="error"
                icon={<ShieldX />}
                title="Demasiadas solicitudes"
                description={retryAfterDetail(notice.retryAfterSeconds)}
              />
            )}
            {notice?.kind === "staleVersion" && (
              <InlineNotice
                tone="error"
                icon={<RotateCcw />}
                title="El punto de venta cambió mientras lo editabas"
                description="Recargá los datos y volvé a hacer el cambio."
              />
            )}
            {notice?.kind === "realTimeMissing" && (
              <InlineNotice
                tone="error"
                icon={<TriangleAlert />}
                title="Falta el punto de venta CAE"
                description="Configurá primero el punto de venta CAE de esta caja."
              />
            )}
            <form.AppField name="pointOfSaleNumber">
              {(field) => (
                <field.TextField kind="plain-text" label="Punto de venta CAEA" required />
              )}
            </form.AppField>
            <InlineNotice
              tone="warning"
              icon={<Info />}
              description="Tiene que ser un punto de venta CAEA dado de alta en ARCA solo para esta caja, en el mismo domicilio que su punto de venta CAE."
            />
          </div>
        ) : null}
      </Modal>
      {modal}
    </>
  );
}
