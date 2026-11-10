import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { ScreenHeader } from "@purosur/ui";
import type { ReactNode } from "react";
import { NoSessionRail } from "../shell/no-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashOpeningPanel } from "./cash-opening-panel";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  signOut: () => void;
  offers?: ReactNode | undefined;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
};

export function NoSessionScreen({
  person,
  registerName,
  signOut,
  offers,
  openCashSession,
}: NoSessionScreenProps) {
  return (
    <RegisterFrame
      background="surface"
      rail={<NoSessionRail person={person} signOut={signOut} />}
      aside={
        <CashOpeningPanel
          firstName={person.first_name}
          canOpen={person.abilities.includes("open_cash_session")}
          open={openCashSession}
        />
      }
    >
      <main className="flex flex-1 flex-col gap-6 p-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="¿Qué querés hacer?" />
        {offers}
      </main>
    </RegisterFrame>
  );
}
