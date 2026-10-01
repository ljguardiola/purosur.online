import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  PinPolicy,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { ArrowLeft, Mail, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ScreenLink } from "../shell/screen-link";
import { FirstSignInPanel } from "./first-sign-in-panel";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";
import { noticeFor } from "./pin-refusal";
import { useFirstPinCodeRequest } from "./use-first-pin-code-request";

export type FirstSignInCodeStepProps = {
  person: SignInUser;
  loadPinPolicy: () => Promise<PinPolicy>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
};

export function FirstSignInCodeStep({
  person,
  loadPinPolicy,
  redeem,
  signIn,
  requestCode,
}: FirstSignInCodeStepProps) {
  const [signInRefusal, setSignInRefusal] =
    useState<Exclude<SignInOutcome, { kind: "signed_in" }>>();
  const [resent, setResent] = useState(false);
  const another = useFirstPinCodeRequest({
    request: () => requestCode(person.id),
    onSent: () => setResent(true),
  });

  async function signInWith(pin: string) {
    const outcome = await signIn(person.id, pin).catch(
      (): SignInOutcome => ({ kind: "unavailable" }),
    );
    if (outcome.kind !== "signed_in") {
      setSignInRefusal(outcome);
    }
  }

  if (signInRefusal !== undefined) {
    const permissionNotice =
      signInRefusal.kind === "no_register_permission" ? noticeFor(signInRefusal, 0) : undefined;
    return (
      <FirstSignInPanel eyebrow={person.first_name} title="PIN nuevo guardado">
        <InlineNotice
          tone="error"
          icon={permissionNotice?.icon ?? <TriangleAlert />}
          title={permissionNotice?.title ?? "No se pudo entrar"}
          description={
            permissionNotice?.description ??
            "Tu PIN nuevo quedó guardado. Entrá con él desde el inicio."
          }
        />
        <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver al inicio" />
      </FirstSignInPanel>
    );
  }

  function askForAnother() {
    setResent(false);
    return another.ask();
  }

  return (
    <FirstSignInPanel
      eyebrow={person.first_name}
      title="Elegí tu PIN"
      description="Te mandamos un código por correo. Vale 15 minutos."
    >
      <PinCodeRedemptionForm
        loadPinPolicy={loadPinPolicy}
        redeem={redeem}
        onRedeemed={signInWith}
        submitLabel="Guardar y entrar"
        newCodeAskedIn="register"
      >
        {resent ? (
          <InlineNotice
            tone="success"
            icon={<Mail />}
            title="Te mandamos un código nuevo"
            description="El anterior ya no sirve."
          />
        ) : null}
        {another.notice === undefined ? null : (
          <InlineNotice
            tone="error"
            icon={another.notice.icon}
            title={another.notice.title}
            description={another.notice.description}
          />
        )}
        <Button
          variant="secondary"
          fullWidth
          icon={<Mail />}
          disabled={another.asking}
          onPress={askForAnother}
        >
          Pedir otro código
        </Button>
        <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
      </PinCodeRedemptionForm>
    </FirstSignInPanel>
  );
}
