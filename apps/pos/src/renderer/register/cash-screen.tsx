import type { CashBalance } from "@purosur/contracts";
import { Button } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import type { SignedInPerson } from "../access/signed-in-person";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { useCashBalance } from "./use-cash-balance";

export type CashScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
};

export function CashScreen({
  person,
  registerName,
  openedAt,
  lock,
  loadCashBalance,
}: CashScreenProps) {
  const navigate = useNavigate();
  const { state, retry } = useCashBalance(loadCashBalance);

  return (
    <div className="flex h-screen w-screen bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="cash"
      />
      <main className="flex flex-1 flex-col gap-1.5 p-8">
        <SessionEyebrow registerName={registerName} openedAt={openedAt} />
        <h1 className="text-display text-text-accent">Caja</h1>
      </main>
      <ExpectedCashPanel eyebrow="EFECTIVO ESPERADO AHORA" balance={state} onRetry={retry}>
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<Lock />}
          onPress={() => void navigate({ to: "/cash-count", search: { leaving: false } })}
        >
          Cerrar caja
        </Button>
      </ExpectedCashPanel>
    </div>
  );
}
