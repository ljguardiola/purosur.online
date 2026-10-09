import type { PinCodeRedemptionOutcome, PinPolicy } from "@purosur/contracts";
import { Button, InlineNotice, ScreenHeader } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";

export type PinCodeRedemptionScreenProps = {
  loadPinPolicy: () => Promise<PinPolicy>;
  checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
};

export function PinCodeRedemptionScreen({
  loadPinPolicy,
  checkRedemption,
  redeem,
}: PinCodeRedemptionScreenProps) {
  const [redeemed, setRedeemed] = useState(false);
  const navigate = useNavigate();

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <ScreenHeader
          title="Cambiar el PIN"
          description={
            redeemed
              ? undefined
              : "Escribí el código que te dieron desde el backoffice. Hace falta internet."
          }
        />
        {redeemed ? (
          <>
            <InlineNotice
              tone="success"
              icon={<CircleCheck />}
              title="PIN nuevo guardado"
              description="Ya podés entrar con tu PIN nuevo."
            />
            <Button fullWidth onPress={() => navigate({ to: "/sign-in" })}>
              Volver al inicio
            </Button>
          </>
        ) : (
          <PinCodeRedemptionForm
            loadPinPolicy={loadPinPolicy}
            checkRedemption={checkRedemption}
            redeem={redeem}
            onRedeemed={() => setRedeemed(true)}
            submitLabel="Guardar el PIN nuevo"
            newCodeAskedIn="backoffice"
          >
            <ScreenLink to="/sign-in" icon={<ArrowLeft />} label="Volver" />
          </PinCodeRedemptionForm>
        )}
      </main>
    </BrandPanelScreen>
  );
}
