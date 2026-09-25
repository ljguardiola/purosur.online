import { Button, InlineNotice, Modal } from "@purosur/ui";
import type { AuthenticationResponseJSON } from "@simplewebauthn/browser";
import { startAuthentication } from "@simplewebauthn/browser";
import { Fingerprint, ShieldX, TriangleAlert, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { messages } from "./messages";
import { authorizeSession, fetchSessionAuthorizationOptions } from "./sessionApi";

const authMessages = messages.passkeyAuthorization;

export type AuthorizationActionKey = keyof typeof authMessages.actions;

export type AuthorizationServices = {
  fetchSessionAuthorizationOptions: typeof fetchSessionAuthorizationOptions;
  authorizeSession: typeof authorizeSession;
  startAuthentication: typeof startAuthentication;
};

export const defaultAuthorizationServices: AuthorizationServices = {
  fetchSessionAuthorizationOptions,
  authorizeSession,
  startAuthentication,
};

type ModalNotice = { kind: "attemptFailed" } | { kind: "rateLimited"; retryAfterSeconds: number };

// Every attempt this mechanism runs answers this shape at minimum: the same `authorization_required`
// code every sensitive route now answers with instead of its own per-action challenge.
type Authorizable = { kind: string };

type AuthorizationModalProps = {
  isOpen: boolean;
  action: AuthorizationActionKey;
  notice: ModalNotice | null;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function AuthorizationModal({
  isOpen,
  action,
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
      title={authMessages.title}
      closable
      closeLabel={authMessages.closeLabel}
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
            {authMessages.cancel}
          </Button>
          <Button
            variant="primary"
            size="large"
            icon={<Fingerprint />}
            fullWidth
            isDisabled={submitting}
            onPress={onConfirm}
          >
            {authMessages.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-base text-ink-secondary">
          {authMessages.body({ action: authMessages.actions[action] })}
        </p>
        {notice?.kind === "attemptFailed" && (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={authMessages.attemptFailedTitle}
            detail={authMessages.attemptFailedDetail}
          />
        )}
        {notice?.kind === "rateLimited" && (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title={authMessages.rateLimitedTitle}
            detail={authMessages.rateLimitedDetail({
              minutes: Math.ceil(notice.retryAfterSeconds / 60),
            })}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * Shared step-up mechanism every sensitive backoffice action uses: `run` attempts the action once,
 * and only when the cloud answers `authorization_required` opens this passkey-authorization modal.
 * "Usar mi passkey" confirms with `POST /users/session/authorization` and retries the given attempt
 * exactly once, resolving `run`'s promise with whatever that retry answers. Cancel resolves
 * `{ kind: "cancelled" }` and leaves the caller's own form untouched — nothing is retried; a session
 * found already ended while authorizing also resolves `{ kind: "cancelled" }` after calling
 * `onSessionEnded`. A failed
 * passkey ceremony or a rejected authorization shows an error inside the modal instead of closing
 * it, so the person can try again or cancel.
 */
export function useAuthorization<T extends Authorizable>({
  action,
  onSessionEnded,
  services,
}: {
  action: AuthorizationActionKey;
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

  // Settles `run` as cancelled so the caller stops waiting, and leaves ending the session to
  // `onSessionEnded` alone, called exactly once here.
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
        action={action}
        notice={notice}
        submitting={submitting}
        onCancel={cancel}
        onConfirm={() => void confirm()}
      />
    ),
  };
}
