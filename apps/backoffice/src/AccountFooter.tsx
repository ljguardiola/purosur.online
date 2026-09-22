import { Button, Modal } from "@purosur/ui";
import { LogOut, X } from "lucide-react";
import { useState } from "react";
import { messages } from "./messages";
import { signOut } from "./sessionApi";

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

/** The rail footer's own identity (the signed-in user's name) and its Salir item, drawn below the area nav items. */
export function AccountFooter({ displayName, onSignedOut }: AccountFooterProps) {
  const [confirming, setConfirming] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleConfirm() {
    setSigningOut(true);
    await signOut();
    setSigningOut(false);
    setConfirming(false);
    onSignedOut();
  }

  return (
    <>
      <p className="w-full text-center text-xs font-semibold leading-[1.2] text-blue-soft">
        {displayName}
      </p>
      <button type="button" className={railItemClassName} onClick={() => setConfirming(true)}>
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
        {null}
      </Modal>
    </>
  );
}
