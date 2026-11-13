import type { SignInOutcome, SignInUser } from "@purosur/contracts";
import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { PinAttemptControls } from "../platform/pin-attempt-controls";
import { SignInLockout } from "../platform/sign-in-lockout";
import { useEscapeToSignIn } from "../platform/use-escape-to-sign-in";
import { usePinAttempt } from "../platform/use-pin-attempt";
import { BrandPanelCard } from "../shell/brand-panel-card";

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
  useEscapeToSignIn();

  if (attempt.refusal?.kind === "locked") {
    return (
      <BrandPanelCard
        icon={<Lock />}
        eyebrow={person.first_name}
        title={`${attempt.refusal.firstName} está bloqueado`}
        titleRef={attempt.heading}
        escapeKeycap
      >
        <SignInLockout
          consecutiveFailures={attempt.refusal.consecutiveFailures}
          backLabel="Volver al inicio"
          onBack={() => navigate({ to: "/sign-in" })}
        />
      </BrandPanelCard>
    );
  }

  return (
    <BrandPanelCard
      icon={<Lock />}
      eyebrow={person.first_name}
      title="Ingresá tu PIN"
      titleRef={attempt.heading}
      escapeKeycap
    >
      <form className="flex flex-col gap-4" noValidate onSubmit={attempt.submit}>
        <PinAttemptControls attempt={attempt} pinInput={attempt.pinInput} />
      </form>
    </BrandPanelCard>
  );
}
