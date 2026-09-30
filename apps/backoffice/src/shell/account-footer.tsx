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
  "focus-visible:focus-ring-inverse";
const railIconWrapperClassName =
  "inline-flex size-icon-lg shrink-0 text-text-inverse-subtle *:size-full";
const nameLinkClassName =
  "w-full rounded-sm px-1 text-center text-caption font-semibold leading-xs text-text-inverse-subtle outline-none " +
  "focus-visible:focus-ring-inverse";

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
      <Link to="/account" className={nameLinkClassName}>
        {displayName}
      </Link>
      <button type="button" className={railItemClassName} onClick={openConfirm}>
        <span aria-hidden="true" className={railIconWrapperClassName}>
          <LogOut />
        </span>
        <span className="text-caption text-text-inverse-subtle">Salir</span>
      </button>
      <Modal
        open={confirming}
        onOpenChange={setConfirming}
        width="standard"
        tone="info"
        icon={<LogOut />}
        context={displayName}
        title="¿Salir del backoffice?"
        closable
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              disabled={signingOut}
              onPress={() => setConfirming(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<LogOut />}
              fullWidth
              disabled={signingOut}
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
            description={retryAfterDetail(notice.retryAfterSeconds)}
          />
        ) : null}
        {notice?.kind === "failed" ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title="No se pudo salir"
            description="Probá de nuevo."
          />
        ) : null}
      </Modal>
    </>
  );
}
