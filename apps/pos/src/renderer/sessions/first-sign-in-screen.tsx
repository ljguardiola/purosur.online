import type {
  FirstPinCodeRequestOutcome,
  PinCodeRedemptionOutcome,
  PinPolicy,
  SignInOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { ComponentType } from "react";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import type { FirstSignInEmailStepProps, FoundPerson } from "./first-sign-in-email-step";
import { FirstSignInEmailStep } from "./first-sign-in-email-step";
import { FirstSignInPinStep } from "./first-sign-in-pin-step";

export type FirstSignInScreenProps = {
  lookup: FirstSignInEmailStepProps["lookup"];
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
  requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  loadPinPolicy: () => Promise<PinPolicy>;
  checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
  redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
  NoPinStep: ComponentType<{
    person: SignInUser;
    requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
    onSent: () => void;
  }>;
  CodeStep: ComponentType<{
    person: SignInUser;
    loadPinPolicy: () => Promise<PinPolicy>;
    checkRedemption: (typedCode: string, newPin: string) => Promise<("reset_code" | "new_pin")[]>;
    redeem: (typedCode: string, newPin: string) => Promise<PinCodeRedemptionOutcome>;
    signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
    requestCode: (userId: string) => Promise<FirstPinCodeRequestOutcome>;
  }>;
};

export function FirstSignInScreen({
  lookup,
  signIn,
  requestCode,
  loadPinPolicy,
  checkRedemption,
  redeem,
  NoPinStep,
  CodeStep,
}: FirstSignInScreenProps) {
  const [found, setFound] = useState<FoundPerson>();

  return (
    <BrandPanelScreen>
      {found === undefined ? (
        <FirstSignInEmailStep lookup={lookup} onFound={setFound} />
      ) : (
        <FoundPersonStep
          person={found}
          signIn={signIn}
          requestCode={requestCode}
          loadPinPolicy={loadPinPolicy}
          checkRedemption={checkRedemption}
          redeem={redeem}
          NoPinStep={NoPinStep}
          CodeStep={CodeStep}
        />
      )}
    </BrandPanelScreen>
  );
}

function FoundPersonStep({
  person,
  signIn,
  requestCode,
  loadPinPolicy,
  checkRedemption,
  redeem,
  NoPinStep,
  CodeStep,
}: { person: FoundPerson } & Omit<FirstSignInScreenProps, "lookup">) {
  const [codeSent, setCodeSent] = useState(false);

  if (person.kind === "has_pin") {
    return <FirstSignInPinStep person={person.user} signIn={signIn} />;
  }
  return codeSent ? (
    <CodeStep
      person={person.user}
      loadPinPolicy={loadPinPolicy}
      checkRedemption={checkRedemption}
      redeem={redeem}
      signIn={signIn}
      requestCode={requestCode}
    />
  ) : (
    <NoPinStep person={person.user} requestCode={requestCode} onSent={() => setCodeSent(true)} />
  );
}
