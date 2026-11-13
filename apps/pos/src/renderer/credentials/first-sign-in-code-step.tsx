import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  PinPolicy,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { CircleCheck, KeyRound, Mail, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { useKeys } from "../platform/key-layer";
import { noticeFor } from "../platform/pin-refusal";
import { useEscapeToSignIn } from "../platform/use-escape-to-sign-in";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { BackToStartButton } from "./back-to-start-button";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";
import { useFirstPinCodeRequest } from "./use-first-pin-code-request";

export type FirstSignInCodeStepProps = {
  person: SignInUser;
  loadPinPolicy: () => Promise<PinPolicy>;
  checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
};

export function FirstSignInCodeStep({
  person,
  loadPinPolicy,
  checkRedemption,
  redeem,
  signIn,
  requestCode,
}: FirstSignInCodeStepProps) {
  const [signInRefusal, setSignInRefusal] =
    useState<Exclude<SignInOutcome, { kind: "signed_in" }>>();
  const [openedByAnother, setOpenedByAnother] = useState(false);
  const [resent, setResent] = useState(false);
  const another = useFirstPinCodeRequest({
    request: () => requestCode(person.id),
    onSent: () => setResent(true),
  });

  function askForAnother() {
    setResent(false);
    return another.ask();
  }

  const choosing = signInRefusal === undefined && !openedByAnother;
  useEscapeToSignIn(choosing);
  useKeys([{ key: "F2", run: () => void askForAnother(), enabled: choosing && !another.asking }]);

  async function signInWith(pin: string) {
    const outcome = await signIn(person.id, pin).catch(
      (): SignInOutcome => ({ kind: "unavailable" }),
    );
    if (outcome.kind !== "signed_in") {
      setSignInRefusal(outcome);
    }
  }

  if (openedByAnother) {
    return (
      <BrandPanelCard icon={<KeyRound />} eyebrow={person.first_name} title="PIN nuevo guardado">
        <InlineNotice
          tone="success"
          icon={<CircleCheck />}
          title="PIN nuevo guardado"
          description="La caja está abierta: solo puede entrar quien la abrió."
        />
        <BackToStartButton />
      </BrandPanelCard>
    );
  }

  if (signInRefusal !== undefined) {
    const permissionNotice =
      signInRefusal.kind === "no_register_permission" ? noticeFor(signInRefusal, 0) : undefined;
    return (
      <BrandPanelCard icon={<KeyRound />} eyebrow={person.first_name} title="PIN nuevo guardado">
        <InlineNotice
          tone="warning"
          icon={permissionNotice?.icon ?? <TriangleAlert />}
          title={permissionNotice?.title ?? "No se pudo entrar"}
          description={
            permissionNotice?.description ??
            "Tu PIN nuevo quedó guardado. Entrá con él desde el inicio."
          }
        />
        <BackToStartButton />
      </BrandPanelCard>
    );
  }

  return (
    <BrandPanelCard
      icon={<KeyRound />}
      eyebrow={person.first_name}
      title="Elegí tu PIN"
      escapeKeycap
    >
      <PinCodeRedemptionForm
        loadPinPolicy={loadPinPolicy}
        checkRedemption={checkRedemption}
        redeem={redeem}
        onRedeemed={signInWith}
        onCashSessionOpenedByAnother={() => setOpenedByAnother(true)}
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
        <div className="self-start">
          <Button variant="text" keycap="F2" disabled={another.asking} onPress={askForAnother}>
            Pedir otro código
          </Button>
        </div>
      </PinCodeRedemptionForm>
    </BrandPanelCard>
  );
}
