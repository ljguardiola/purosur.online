import { bitlockerRecoveryKeyLoadBodySchema } from "@purosur/contracts";
import { Button, InlineNotice, Modal, useRequestForm } from "@purosur/ui";
import type { startAuthentication } from "@simplewebauthn/browser";
import { Check, Info, ShieldX, TriangleAlert, Upload, X } from "lucide-react";
import { useEffect } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import type {
  authorizeSession,
  fetchSessionAuthorizationOptions,
} from "../platform/session-authorization-api";
import {
  bitlockerKeyIdentifierMessage,
  bitlockerKeyRequestFrom,
  bitlockerRecoveryKeyMessage,
  EMPTY_BITLOCKER_KEY_FORM,
} from "./bitlocker-key-form";
import { registerModalContext } from "./register-modal-context";
import type {
  LoadBitlockerRecoveryKeyOutcome,
  loadBitlockerRecoveryKey,
  RegisterSummary,
} from "./registers-api";
import { useRevocationAttempt } from "./use-revocation-attempt";

export type LoadBitlockerRecoveryKeyModalServices = {
  loadBitlockerRecoveryKey: typeof loadBitlockerRecoveryKey;
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

type LoadBitlockerRecoveryKeyModalProps = {
  target: RegisterSummary | null;
  onClose: () => void;
  onLoaded: () => void;
  onOutdated: () => void;
  onSessionEnded: () => void;
  services: LoadBitlockerRecoveryKeyModalServices;
};

export function LoadBitlockerRecoveryKeyModal({
  target,
  onClose,
  onLoaded,
  onOutdated,
  onSessionEnded,
  services,
}: LoadBitlockerRecoveryKeyModalProps) {
  const {
    loadBitlockerRecoveryKey,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const open = target !== null;
  const {
    attempt,
    revoking: saving,
    notice,
    modal,
  } = useRevocationAttempt<
    LoadBitlockerRecoveryKeyOutcome,
    "notFound" | "noCurrentInstallation" | "alreadyLoaded"
  >({
    open,
    actionName: "Cargar la clave de recuperación de BitLocker",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });
  const { form, submit, submitting, reset } = useRequestForm({
    defaultValues: EMPTY_BITLOCKER_KEY_FORM,
    request: { schema: bitlockerRecoveryKeyLoadBodySchema, from: bitlockerKeyRequestFrom },
    fields: { recovery_key: "recoveryKey", key_identifier: "keyIdentifier" },
    messages: {
      recoveryKey: bitlockerRecoveryKeyMessage,
      keyIdentifier: bitlockerKeyIdentifierMessage,
    },
    onSubmit: async (request) => {
      if (target === null) {
        return;
      }
      await attempt(
        () => loadBitlockerRecoveryKey(target.id, request),
        (outcome, opening) => {
          if (outcome.kind === "ok") {
            if (opening.current) {
              onClose();
            }
            onLoaded();
          } else if (outcome.kind === "not_found") {
            opening.showNotice("notFound");
            onOutdated();
          } else if (outcome.kind === "no_current_installation") {
            opening.showNotice("noCurrentInstallation");
            onOutdated();
          } else if (outcome.kind === "already_loaded") {
            opening.showNotice("alreadyLoaded");
            onOutdated();
          }
        },
      );
    },
  });

  useEffect(() => {
    if (open) {
      reset();
    }
  }, [open, reset]);

  const busy = submitting || saving;

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
        icon={<Upload />}
        context={registerModalContext(target)}
        title="Cargar clave de recuperación de BitLocker"
        closable
        footer={
          <>
            <Button variant="secondary" size="large" icon={<X />} disabled={busy} onPress={onClose}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<Check />}
              fullWidth
              disabled={busy}
              onPress={() => void submit()}
            >
              Guardar la clave
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {notice?.kind === "notFound" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar la clave"
              description="No se encontró la caja."
            />
          )}
          {notice?.kind === "noCurrentInstallation" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar la clave"
              description="La caja ya no tiene una instalación activa."
            />
          )}
          {notice?.kind === "alreadyLoaded" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar la clave"
              description="La caja ya tiene una clave de recuperación cargada."
            />
          )}
          {notice?.kind === "attemptFailed" && (
            <InlineNotice
              tone="error"
              icon={<TriangleAlert />}
              title="No se pudo guardar la clave"
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
          <form.AppField name="recoveryKey">
            {(field) => (
              <field.TextField
                kind="plain-text"
                label="Clave de recuperación de BitLocker"
                required
              />
            )}
          </form.AppField>
          <form.AppField name="keyIdentifier">
            {(field) => (
              <field.TextField kind="plain-text" label="Identificador de la clave" required />
            )}
          </form.AppField>
          <InlineNotice
            tone="info"
            icon={<Info />}
            description="Guardala para poder consultarla más adelante si Windows la pide al arrancar la notebook, por ejemplo después de un cambio de hardware."
          />
        </div>
      </Modal>
      {modal}
    </>
  );
}
