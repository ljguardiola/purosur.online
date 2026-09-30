import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import { FirstSignInCodeStep } from "./first-sign-in-code-step";
import type { FirstSignInEmailStepProps, FoundPerson } from "./first-sign-in-email-step";
import { FirstSignInEmailStep } from "./first-sign-in-email-step";
import { FirstSignInNoPin } from "./first-sign-in-no-pin";
import { FirstSignInPinStep } from "./first-sign-in-pin-step";

export type FirstSignInScreenProps = {
  lookup: FirstSignInEmailStepProps["lookup"];
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
};

export function FirstSignInScreen({ lookup, signIn, requestCode, redeem }: FirstSignInScreenProps) {
  const [found, setFound] = useState<FoundPerson>();

  return (
    <BrandPanelScreen>
      {found === undefined ? (
        <FirstSignInEmailStep lookup={lookup} onFound={setFound} />
      ) : (
        <FoundPersonStep person={found} signIn={signIn} requestCode={requestCode} redeem={redeem} />
      )}
    </BrandPanelScreen>
  );
}

function FoundPersonStep({
  person,
  signIn,
  requestCode,
  redeem,
}: { person: FoundPerson } & Omit<FirstSignInScreenProps, "lookup">) {
  const [codeSent, setCodeSent] = useState(false);

  if (person.kind === "has_pin") {
    return <FirstSignInPinStep person={person.user} signIn={signIn} />;
  }
  return codeSent ? (
    <FirstSignInCodeStep
      person={person.user}
      redeem={redeem}
      signIn={signIn}
      requestCode={requestCode}
    />
  ) : (
    <FirstSignInNoPin
      person={person.user}
      requestCode={requestCode}
      onSent={() => setCodeSent(true)}
    />
  );
}
