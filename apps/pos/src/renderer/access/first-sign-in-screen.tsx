import type { SignInOutcome } from "@purosur/contracts";
import { useState } from "react";
import { BrandPanelScreen } from "../shell/brand-panel-screen";
import type { FirstSignInEmailStepProps, FoundPerson } from "./first-sign-in-email-step";
import { FirstSignInEmailStep } from "./first-sign-in-email-step";
import { FirstSignInNoPin } from "./first-sign-in-no-pin";
import { FirstSignInPinStep } from "./first-sign-in-pin-step";

export type FirstSignInScreenProps = {
  lookup: FirstSignInEmailStepProps["lookup"];
  signIn: (userId: string, pin: string) => Promise<SignInOutcome>;
};

export function FirstSignInScreen({ lookup, signIn }: FirstSignInScreenProps) {
  const [found, setFound] = useState<FoundPerson>();

  return (
    <BrandPanelScreen>
      {found === undefined ? (
        <FirstSignInEmailStep lookup={lookup} onFound={setFound} />
      ) : (
        <FoundPersonStep person={found} signIn={signIn} />
      )}
    </BrandPanelScreen>
  );
}

function FoundPersonStep({
  person,
  signIn,
}: {
  person: FoundPerson;
  signIn: FirstSignInScreenProps["signIn"];
}) {
  return person.kind === "has_pin" ? (
    <FirstSignInPinStep person={person.user} signIn={signIn} />
  ) : (
    <FirstSignInNoPin firstName={person.user.first_name} />
  );
}
