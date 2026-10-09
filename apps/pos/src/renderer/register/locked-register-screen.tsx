import type { SignInOutcome } from "@purosur/contracts";
import { ScreenHeader } from "@purosur/ui";
import { KeyRound, UserLock } from "lucide-react";
import { useId } from "react";
import { SignInLockout } from "../platform/sign-in-lockout";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import type { SignedInPerson } from "../shell/signed-in-person";
import { ResumePinForm } from "./resume-pin-form";

export type LockedRegisterScreenProps = {
  opener: SignedInPerson;
  registerName: string | null;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

export function LockedRegisterScreen({ opener, registerName, signIn }: LockedRegisterScreenProps) {
  const headingId = useId();
  const attempt = usePinAttempt({
    id: opener.user_id,
    firstName: opener.first_name,
    attempt: (pin) => signIn(opener.user_id, pin),
  });
  const { refusal, heading, reset } = attempt;

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-6">
        <ScreenHeader
          eyebrow={registerName ?? undefined}
          titleId={headingId}
          titleRef={heading}
          title={
            refusal?.kind === "locked" ? `${refusal.firstName} está bloqueado` : "Caja bloqueada"
          }
        />
        {refusal?.kind === "locked" ? (
          <SignInLockout
            consecutiveFailures={refusal.consecutiveFailures}
            backLabel="Volver"
            onBack={reset}
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
            <ScreenLink
              to="/locked-close"
              icon={<UserLock />}
              label="Otra persona cierra la caja"
            />
          </>
        )}
      </main>
    </BrandPanelScreen>
  );
}
