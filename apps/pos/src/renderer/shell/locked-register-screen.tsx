import type { SignInOutcome } from "@purosur/contracts";
import { InlineNotice } from "@purosur/ui";
import { KeyRound } from "lucide-react";
import { useId } from "react";
import { ResumePinForm } from "../access/resume-pin-form";
import type { SignedInPerson } from "../access/signed-in-person";
import { usePinAttempt } from "../access/use-pin-attempt";
import { BrandPanelScreen } from "./brand-panel-screen";
import { SessionEyebrow } from "./session-eyebrow";

export type LockedRegisterScreenProps = {
  opener: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

export function LockedRegisterScreen({
  opener,
  registerName,
  openedAt,
  signIn,
}: LockedRegisterScreenProps) {
  const headingId = useId();
  const attempt = usePinAttempt({
    id: opener.user_id,
    firstName: opener.first_name,
    signIn: (pin) => signIn(opener.user_id, pin),
  });
  const { refusal } = attempt;

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1
            id={headingId}
            ref={attempt.heading}
            tabIndex={-1}
            className="text-display text-text-accent outline-none"
          >
            {refusal?.kind === "locked" ? `${refusal.firstName} está bloqueado` : "Caja bloqueada"}
          </h1>
        </div>
        {refusal?.kind === "locked" ? (
          <>
            <p className="text-body text-text">
              Se equivocó {refusal.consecutiveFailures} veces seguidas con el PIN.
            </p>
            <InlineNotice
              tone="warning"
              icon={<KeyRound />}
              title="Se vuelve a entrar con un código"
              description="Alguien con permiso lo genera desde el backoffice."
            />
          </>
        ) : (
          <ResumePinForm
            opener={{ id: opener.user_id, first_name: opener.first_name }}
            attempt={attempt}
            labelledBy={headingId}
          />
        )}
      </main>
    </BrandPanelScreen>
  );
}
