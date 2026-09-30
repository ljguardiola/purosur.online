import { Button, type LoadStatus } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { useRef, useState } from "react";
import { useRefreshAccess } from "./access-queries";
import { useAuthorization } from "./authorization-modal";
import {
  type EmissionState,
  EmitUserPinCodeModal,
  type EmitUserPinCodeModalServices,
} from "./emit-user-pin-code-modal";
import { pinCodeValidity } from "./pin-code-validity";
import { useSendToMyAccount } from "./send-to-my-account";
import type { EmitUserPinCodeOutcome } from "./users-api";

type UserPinSectionProps = {
  user: { id: string; firstName: string };
  dataStatus?: LoadStatus;
  onSessionEnded: () => void;
  services: EmitUserPinCodeModalServices;
};

export function UserPinSection({
  user,
  dataStatus,
  onSessionEnded,
  services,
}: UserPinSectionProps) {
  const {
    emitUserPinCode,
    fetchSessionAuthorizationOptions,
    authorizeSession,
    startAuthentication,
  } = services;
  const sendToMyAccount = useSendToMyAccount();
  const refreshAccess = useRefreshAccess();
  const [emission, setEmission] = useState<EmissionState>({ kind: "closed" });
  const latestEmission = useRef(0);
  const { run, modal: authorizationModal } = useAuthorization<EmitUserPinCodeOutcome>({
    actionName: "Reiniciar el PIN",
    onSessionEnded,
    services: { fetchSessionAuthorizationOptions, authorizeSession, startAuthentication },
  });

  async function emit() {
    if (emission.kind === "issuing") {
      return;
    }
    latestEmission.current += 1;
    const thisEmission = latestEmission.current;
    setEmission({ kind: "issuing", user });

    const outcome = await run(() => emitUserPinCode(user.id));
    if (thisEmission !== latestEmission.current) {
      return;
    }
    if (outcome.kind === "ok") {
      setEmission({ kind: "issued", user, code: outcome.value.code });
      return;
    }
    if (outcome.kind === "unauthenticated") {
      setEmission({ kind: "closed" });
      onSessionEnded();
      return;
    }
    if (outcome.kind === "forbidden") {
      setEmission({ kind: "closed" });
      sendToMyAccount();
      return;
    }
    if (outcome.kind === "not_found" || outcome.kind === "inactive") {
      setEmission({ kind: "closed" });
      void refreshAccess();
      return;
    }
    if (outcome.kind === "cancelled") {
      setEmission({ kind: "closed" });
      return;
    }
    if (outcome.kind === "rate_limited") {
      setEmission({ kind: "rateLimited", user, retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    setEmission({ kind: "attemptFailed", user });
  }

  function close() {
    latestEmission.current += 1;
    setEmission({ kind: "closed" });
  }

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <h2 className="text-subheading text-text-accent">PIN de la caja</h2>
        <div className="flex items-center gap-3">
          <p className="flex-1 text-text-subtle text-detail">
            {`El código de reinicio vale ${pinCodeValidity()} y se usa una sola vez en la caja.`}
          </p>
          <Button
            variant="secondary"
            size="small"
            icon={<KeyRound />}
            {...(dataStatus ? { dataStatus } : {})}
            onPress={() => void emit()}
          >
            Reiniciar el PIN
          </Button>
        </div>
      </div>
      <EmitUserPinCodeModal
        emission={emission}
        onClose={close}
        onDone={close}
        onRetry={() => void emit()}
      />
      {authorizationModal}
    </>
  );
}
