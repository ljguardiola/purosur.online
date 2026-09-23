import { Button, InlineNotice, Modal } from "@purosur/ui";
import { LogOut, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { linkProps } from "./linkProps";
import { messages } from "./messages";
import { signOut } from "./sessionApi";
import { MY_ACCOUNT_PATH } from "./settingsRoutes";

export type AccountFooterProps = {
  displayName: string;
  onSignedOut: () => void;
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

/** The rail footer's own identity (the signed-in user's name) and its Salir item, drawn below the area nav items. */
export function AccountFooter({ displayName, onSignedOut }: AccountFooterProps) {
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [failed, setFailed] = useState(false);

  function openConfirm() {
    setFailed(false);
    setConfirming(true);
  }

  async function handleConfirm() {
    setFailed(false);
    setSigningOut(true);
    const outcome = await signOut();
    setSigningOut(false);
    // Leaving for the sign-in screen after a sign-out the cloud never heard would only look like
    // one: the session and its cookie are still live, so the person stays where they are.
    if (outcome.kind !== "ok") {
      setFailed(true);
      return;
    }
    setConfirming(false);
    onSignedOut();
  }

  return (
    <>
      <a {...linkProps(MY_ACCOUNT_PATH)} className={nameLinkClassName}>
        {displayName}
      </a>
      <button type="button" className={railItemClassName} onClick={openConfirm}>
        <span aria-hidden="true" className={railIconWrapperClassName}>
          <LogOut />
        </span>
        <span className="text-xs font-normal text-blue-soft">
          {messages.shell.signOut.itemLabel}
        </span>
      </button>
      <Modal
        isOpen={confirming}
        onOpenChange={setConfirming}
        width="standard"
        tone="info"
        icon={<LogOut />}
        context={displayName}
        contextTone="brand-earth-ui"
        title={messages.shell.signOut.title}
        closable
        closeLabel={messages.shell.signOut.closeLabel}
        footer={
          <>
            <Button
              variant="secondary"
              size="large"
              icon={<X />}
              isDisabled={signingOut}
              onPress={() => setConfirming(false)}
            >
              {messages.shell.signOut.cancel}
            </Button>
            <Button
              variant="primary"
              size="large"
              icon={<LogOut />}
              fullWidth
              isDisabled={signingOut}
              onPress={() => void handleConfirm()}
            >
              {messages.shell.signOut.confirm}
            </Button>
          </>
        }
      >
        {failed ? (
          <InlineNotice
            tone="error"
            icon={<TriangleAlert />}
            title={messages.shell.signOut.failedTitle}
            detail={messages.shell.signOut.failedDetail}
          />
        ) : null}
      </Modal>
    </>
  );
}
