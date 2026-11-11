import type { OpenCashSessionOutcome, OpeningFloatSuggestion } from "@purosur/contracts";
import { IconCard, ScaleCard, SearchField } from "@purosur/ui";
import { Lock, ScanBarcode } from "lucide-react";
import type { ReactNode } from "react";
import { NoSessionRail } from "../shell/no-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashOpeningPanel } from "./cash-opening-panel";

export type NoSessionScreenProps = {
  person: SignedInPerson;
  signOut: () => void;
  offers?: ReactNode | undefined;
  openCashSession: (openingFloat: number) => Promise<OpenCashSessionOutcome>;
  readOpeningFloatSuggestion: () => Promise<OpeningFloatSuggestion | null | "unavailable">;
};

function LockedRegister() {
  return (
    <div className="hidden min-h-0 flex-1 flex-col gap-4 peer-empty:flex">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <SearchField
            label="Producto"
            placeholder="Escaneá o escribí el nombre"
            icon={<ScanBarcode />}
            value=""
            onChange={() => {}}
            disabled
          />
        </div>
        <ScaleCard label="Balanza" />
      </div>
      <IconCard icon={<Lock />} label="Caja sin sesión abierta" />
    </div>
  );
}

export function NoSessionScreen({
  person,
  signOut,
  offers,
  openCashSession,
  readOpeningFloatSuggestion,
}: NoSessionScreenProps) {
  return (
    <RegisterFrame
      background="subtle"
      rail={<NoSessionRail person={person} signOut={signOut} />}
      aside={
        <CashOpeningPanel
          firstName={person.first_name}
          canOpen={person.abilities.includes("open_cash_session")}
          open={openCashSession}
          readOpeningFloatSuggestion={readOpeningFloatSuggestion}
        />
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <h1 className="sr-only">¿Qué querés hacer?</h1>
        <div className="peer flex min-h-0 flex-1 flex-col gap-4 empty:hidden">{offers}</div>
        <LockedRegister />
      </main>
    </RegisterFrame>
  );
}
