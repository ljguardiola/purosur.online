import type { SignInOutcome } from "@purosur/contracts";
import { KeyRound } from "lucide-react";
import { useId } from "react";
import { ResumePinForm } from "../access/resume-pin-form";
import { SignInLockout } from "../access/sign-in-lockout";
import type { SignedInPerson } from "../access/signed-in-person";
import { usePinAttempt } from "../access/use-pin-attempt";
import { BrandPanelScreen } from "./brand-panel-screen";
import { ScreenLink } from "./screen-link";
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
          <SignInLockout
            consecutiveFailures={refusal.consecutiveFailures}
            backLabel="Volver"
            onBack={attempt.reset}
          />
        ) : (
          <>
            <ResumePinForm
              opener={{ id: opener.user_id, first_name: opener.first_name }}
              attempt={attempt}
              labelledBy={headingId}
            />
            <ScreenLink
              to="/pin-code-redemption"
              icon={<KeyRound />}
              label="Tengo un código para cambiar el PIN"
            />
          </>
        )}
      </main>
    </BrandPanelScreen>
  );
}
