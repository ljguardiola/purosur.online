import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PinAttemptControls } from "../platform/pin-attempt-controls";
import { SignInLockout } from "../platform/sign-in-lockout";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { ScreenLink } from "../shell/screen-link";
import { FirstSignInPanel } from "./first-sign-in-panel";

export type FirstSignInPinStepProps = {
  person: SignInUser;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

export function FirstSignInPinStep({ person, signIn }: FirstSignInPinStepProps) {
  const attempt = usePinAttempt({
    id: person.id,
    firstName: person.first_name,
    attempt: (pin) => signIn(person.id, pin),
  });
  const navigate = useNavigate();

  if (attempt.refusal?.kind === "locked") {
    return (
      <FirstSignInPanel
        eyebrow={person.first_name}
        title={`${attempt.refusal.firstName} está bloqueado`}
        headingRef={attempt.heading}
      >
        <SignInLockout
          consecutiveFailures={attempt.refusal.consecutiveFailures}
          backLabel="Volver al inicio"
          onBack={() => navigate({ to: "/sign-in" })}
        />
      </FirstSignInPanel>
    );
  }

  return (
    <FirstSignInPanel
      eyebrow={person.first_name}
      title="Ingresá tu PIN"
      headingRef={attempt.heading}
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
        <PinAttemptControls attempt={attempt} pinInput={attempt.pinInput} />
        <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
      </form>
    </FirstSignInPanel>
  );
}
