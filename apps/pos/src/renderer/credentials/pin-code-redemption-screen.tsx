import type { PinCodeRedemptionOutcome, PinPolicy } from "@purosur/contracts";
import { InlineNotice } from "@purosur/ui";
import { CircleCheck, KeyRound } from "lucide-react";
import { useState } from "react";
import { useEscapeToSignIn } from "../platform/use-escape-to-sign-in";
import { BrandPanelCard } from "../shell/brand-panel-card";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { BackToStartButton } from "./back-to-start-button";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";

export type PinCodeRedemptionScreenProps = {
  loadPinPolicy: () => Promise<PinPolicy>;
  checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  version: string | null;
};

type Saved = "none" | "can_enter" | "opened_by_another";

const SAVED_DESCRIPTION = {
  can_enter: "Ya podés entrar con tu PIN nuevo.",
  opened_by_another: "La caja está abierta: solo puede entrar quien la abrió.",
} as const;

export function PinCodeRedemptionScreen({
  loadPinPolicy,
  checkRedemption,
  redeem,
  version,
}: PinCodeRedemptionScreenProps) {
  const [saved, setSaved] = useState<Saved>("none");
  useEscapeToSignIn(saved === "none");

  return (
    <BrandPanelScreen version={version}>
      {saved === "none" ? (
        <BrandPanelCard icon={<KeyRound />} title="Cambiar el PIN" escapeKeycap>
          <PinCodeRedemptionForm
            loadPinPolicy={loadPinPolicy}
            checkRedemption={checkRedemption}
            redeem={redeem}
            onRedeemed={() => setSaved("can_enter")}
            onCashSessionOpenedByAnother={() => setSaved("opened_by_another")}
            submitLabel="Guardar el PIN nuevo"
            newCodeAskedIn="backoffice"
          />
        </BrandPanelCard>
      ) : (
        <BrandPanelCard icon={<KeyRound />} title="Cambiar el PIN">
          <InlineNotice
            tone="success"
            icon={<CircleCheck />}
            title="PIN nuevo guardado"
            description={SAVED_DESCRIPTION[saved]}
          />
          <BackToStartButton />
        </BrandPanelCard>
      )}
    </BrandPanelScreen>
  );
}
