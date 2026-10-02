import type { OpenCashSessionOutcome } from "@purosur/contracts";
import { ScreenHeader } from "@purosur/ui";
import { useState } from "react";
import type { ActionEntry } from "../shell/action-entries";
import { entriesFor } from "../shell/action-entries";
import { NavigationRail } from "../shell/navigation-rail";
import { sessionEyebrow } from "../shell/session-eyebrow";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashOpeningPanel } from "./cash-opening-panel";
import { SignOutModal } from "./sign-out-modal";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  entries: readonly ActionEntry[];
  signOut: () => void;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
};

export function NoSessionScreen({
  person,
  registerName,
  entries,
  signOut,
  openCashSession,
}: NoSessionScreenProps) {
  const [leaving, setLeaving] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-surface">
      <NavigationRail
        firstName={person.first_name}
        entries={entriesFor(entries, person.abilities)}
        onSignOut={() => setLeaving(true)}
      />
      <main className="flex flex-1 flex-col p-8">
        <ScreenHeader eyebrow={sessionEyebrow(registerName)} title="¿Qué querés hacer?" />
      </main>
      <CashOpeningPanel
        firstName={person.first_name}
        canOpen={person.abilities.includes("open_cash_session")}
        open={openCashSession}
      />
      <SignOutModal
        open={leaving}
        firstName={person.first_name}
        onClose={() => setLeaving(false)}
        onSignOut={signOut}
      />
    </div>
  );
}
