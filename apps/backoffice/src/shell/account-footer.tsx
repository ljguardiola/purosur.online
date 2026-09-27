import { Button, InlineNotice, Modal } from "@purosur/ui";
import { Link } from "@tanstack/react-router";
import { LogOut, ShieldX, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { signOut } from "../access/session-api";
import { retryAfterDetail } from "../platform/retry-after-detail";

export type AccountFooterServices = {
  signOut: typeof signOut;
};

export const defaultAccountFooterServices: AccountFooterServices = { signOut };

export type AccountFooterProps = {
  displayName: string;
  onSignedOut: () => void;
  services?: AccountFooterServices;
};

const railItemClassName =
  "flex w-15 flex-col items-center justify-center gap-1 rounded-lg px-0 py-2 outline-none " +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-surface-white";
const railIconWrapperClassName =
  "inline-flex size-5 shrink-0 text-blue-soft [&>svg]:h-full [&>svg]:w-full";
const nameLinkClassName =
  "w-full rounded px-1 text-center text-xs font-semibold leading-[1.2] text-blue-soft outline-none " +
  "focus-visible:outline-[3px] focus-visible:outline-solid focus-visible:outline-offset-2 " +
  "focus-visible:outline-surface-white";

type Notice = { kind: "failed" } | { kind: "rate_limited"; retryAfterSeconds: number };

export function AccountFooter({ displayName, onSignedOut, services }: AccountFooterProps) {
  const { signOut } = services ?? defaultAccountFooterServices;
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  function openConfirm() {
    setNotice(null);
    setConfirming(true);
  }

  async function handleConfirm() {
    setNotice(null);
    setSigningOut(true);
    const outcome = await signOut();
    setSigningOut(false);
    // Stays put on anything but `ok`: the session and its cookie are still live otherwise.
    if (outcome.kind === "rate_limited") {
      setNotice({ kind: "rate_limited", retryAfterSeconds: outcome.retryAfterSeconds });
      return;
    }
    if (outcome.kind !== "ok") {
      setNotice({ kind: "failed" });
      return;
    }
    setConfirming(false);
    onSignedOut();
  }

  return (
    <>
      <Link to="/settings/users/me" className={nameLinkClassName}>
        {displayName}
      </Link>
      <button type="button" className={railItemClassName} onClick={openConfirm}>
        <span aria-hidden="true" className={railIconWrapperClassName}>
          <LogOut />
        </span>
        <span className="text-xs font-normal text-blue-soft">Salir</span>
      </button>
      <Modal
        isOpen={confirming}
        onOpenChange={setConfirming}
        width="standard"
        tone="info"
        icon={<LogOut />}
        context={displayName}
        contextTone="brand-earth-ui"
        title="¿Salir del backoffice?"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={signingOut}
              onPress={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<LogOut />}
              fullWidth
              isDisabled={signingOut}
              onPress={() => void handleConfirm()}
            >
              Salir
            </Button>
          </>
        }
      >
        {notice?.kind === "rate_limited" ? (
          <InlineNotice
            tone="error"
            icon={<ShieldX />}
            title="Demasiadas solicitudes"
            detail={retryAfterDetail(notice.retryAfterSeconds)}
          />
        ) : null}
        {notice?.kind === "failed" ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo salir"
            detail="Probá de nuevo."
          />
        ) : null}
      </Modal>
    </>
  );
}
