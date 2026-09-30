import type { PinCodeRedemptionOutcome } from "@purosur/contracts";
import { Button, InlineNotice } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CircleCheck } from "lucide-react";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { ScreenLink } from "../shell/screen-link";
import { PinCodeRedemptionForm } from "./pin-code-redemption-form";

export type PinCodeRedemptionScreenProps = {
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
};

export function PinCodeRedemptionScreen({ redeem }: PinCodeRedemptionScreenProps) {
  const [redeemed, setRedeemed] = useState(false);
  const navigate = useNavigate();

  return (
    <BrandPanelScreen>
      <main className="flex w-full max-w-110 flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display text-text-accent">Cambiar el PIN</h1>
          {redeemed ? null : (
            <p className="text-body text-text-subtle">
              Escribí el código que te dieron desde el backoffice. Hace falta internet.
            </p>
          )}
        </div>
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
