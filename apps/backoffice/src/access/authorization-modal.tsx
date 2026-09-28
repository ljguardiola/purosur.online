import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, ShieldX, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { retryAfterDetail } from "../platform/retry-after-detail";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./session-api";

export type AuthorizationServices = {
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

const defaultAuthorizationServices: AuthorizationServices = {
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

type ModalNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

// Every attempt answers this shape at minimum: the same `authorization_required` code every
// sensitive route uses instead of its own per-action challenge.
type Authorizable = { kind: string };

type AuthorizationModalProps = {
  isOpen: boolean;
  actionName: string;
  notice: ModalNotice | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function AuthorizationModal({
  isOpen,
  actionName,
  notice,
  submitting,
  onCancel,
  onConfirm,
}: AuthorizationModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onCancel();
        }
      }}
      width="confirmation"
      tone="info"
      icon={<Fingerprint />}
      title="Autorizá este cambio"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<X />}
            fullWidth
            isDisabled={submitting}
            onPress={onCancel}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Fingerprint />}
            fullWidth
            isDisabled={submitting}
            onPress={onConfirm}
          >
            Usar mi passkey
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-body text-text-subtle">
          {`${actionName} necesita tu autorización. Confirmala con tu passkey.`}
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo confirmar con tu passkey"
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
      </div>
    </Modal>
  );
}

export function useAuthorization<T extends Authorizable>({
  actionName,
  onSessionEnded,
  services,
}: {
  actionName: string;
  onSessionEnded: () => void;
  services?: AuthorizationServices;
}): { run: (attempt: () => Promise<T>) => Promise<T | { kind: "cancelled" }>; modal: ReactNode } {
  const { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication } =
    services ?? defaultAuthorizationServices;
  const [isOpen, setIsOpen] = useState(false);
  const [notice, setNotice] = useState<ModalNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pendingRef = useRef<(() => Promise<T>) | null>(null);
  const resolveRef = useRef<((outcome: T | { kind: "cancelled" }) => void) | null>(null);

  async function run(attempt: () => Promise<T>): Promise<T | { kind: "cancelled" }> {
    const outcome = await attempt();
    if (outcome.kind !== "authorization_required") {
      return outcome;
    }
    return new Promise((resolve) => {
      pendingRef.current = attempt;
      resolveRef.current = resolve;
      setNotice(null);
      setIsOpen(true);
    });
  }

  function cancel() {
    const resolve = resolveRef.current;
    pendingRef.current = null;
    resolveRef.current = null;
    setIsOpen(false);
    setSubmitting(false);
    resolve?.({ kind: "cancelled" });
  }

  function endSession() {
    cancel();
    onSessionEnded();
  }

  async function confirm() {
    setNotice(null);
    setSubmitting(true);

    const optionsOutcome = await fetchSessionAuthorizationOptions();
    if (optionsOutcome.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (optionsOutcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: optionsOutcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    if (optionsOutcome.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const assertion = await startAuthentication({ optionsJSON: optionsOutcome.value }).catch(
      (): AuthenticationResponseJSON | null => null,
    );
    if (!assertion) {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const authorizeOutcome = await authorizeSession(assertion);
    if (authorizeOutcome.kind === "unauthenticated") {
      endSession();
      return;
    }
    if (authorizeOutcome.kind === "rate_limited") {
      setNotice({ kind: "rateLimited", retryAfterSeconds: authorizeOutcome.retryAfterSeconds });
      setSubmitting(false);
      return;
    }
    if (authorizeOutcome.kind !== "ok") {
      setNotice({ kind: "attemptFailed" });
      setSubmitting(false);
      return;
    }

    const attempt = pendingRef.current;
    const resolve = resolveRef.current;
    pendingRef.current = null;
    resolveRef.current = null;
    setIsOpen(false);
    setSubmitting(false);
    if (!attempt || !resolve) {
      return;
    }
    resolve(await attempt());
  }

  return {
    run,
    modal: (
      <AuthorizationModal
        isOpen={isOpen}
        actionName={actionName}
        notice={notice}
        submitting={submitting}
        onCancel={cancel}
        onConfirm={() => void confirm()}
      />
    ),
  };
}
