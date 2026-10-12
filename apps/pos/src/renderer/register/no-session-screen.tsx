import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { ScreenHeader } from "@purosur/ui";
import { NoSessionRail } from "../shell/no-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashOpeningPanel } from "./cash-opening-panel";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  signOut: () => void;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
};

export function NoSessionScreen({
  person,
  registerName,
  signOut,
  openCashSession,
}: NoSessionScreenProps) {
  return (
    <div className="flex h-full w-full bg-surface">
      <NoSessionRail person={person} signOut={signOut} />
      <main className="flex flex-1 flex-col p-8">
        <ScreenHeader eyebrow={registerName ?? undefined} title="¿Qué querés hacer?" />
      </main>
      <CashOpeningPanel
        firstName={person.first_name}
        canOpen={person.abilities.includes("open_cash_session")}
        open={openCashSession}
      />
    </div>
  );
}
