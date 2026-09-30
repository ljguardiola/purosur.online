import type {
  CashBalance,
  ListedCashMovement,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CashMovementInput } from "../platform/core-client";
import { OpenSessionRail } from "../shell/open-session-rail";
import { SessionEyebrow } from "../shell/session-eyebrow";
import { CashMovementsTable } from "./cash-movements-table";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { RecordCashMovementModal } from "./record-cash-movement-modal";
import { useCashBalance } from "./use-cash-balance";
import { useCashMovements } from "./use-cash-movements";

export type CashScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadCashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
};

export function CashScreen({
  person,
  registerName,
  openedAt,
  loadCashBalance,
  loadCashMovements,
  loadAuthorizers,
  recordCashMovement,
}: CashScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalance(loadCashBalance);
  const movements = useCashMovements(loadCashMovements);
  const [recording, setRecording] = useState(false);

  return (
    <div className="flex h-screen w-screen bg-surface">
      <OpenSessionRail firstName={person.first_name} current="cash" />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <div className="flex flex-col gap-1.5">
          <SessionEyebrow registerName={registerName} openedAt={openedAt} />
          <h1 className="text-display text-text-accent">Movimientos de efectivo</h1>
        </div>
        <CashMovementsTable state={movements.state} onRetry={movements.retry} />
      </main>
      <ExpectedCashPanel
        eyebrow="EFECTIVO ESPERADO AHORA"
        balance={balance.state}
        onRetry={balance.retry}
      >
        <Button
          variant="primary"
          size="large"
          fullWidth
          icon={<Plus />}
          onPress={() => setRecording(true)}
        >
          Registrar movimiento
        </Button>
        <Button
          variant="secondary"
          size="large"
          fullWidth
          icon={<Lock />}
          onPress={() => void navigate({ to: "/cash-count" })}
        >
          Cerrar caja
        </Button>
      </ExpectedCashPanel>
      <RecordCashMovementModal
        open={recording}
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        {...(balance.state.status === "loaded"
          ? { expectedCash: balance.state.balance.expected }
          : {})}
        loadAuthorizers={loadAuthorizers}
        recordCashMovement={recordCashMovement}
        onClose={() => setRecording(false)}
        onRecorded={() => {
          setRecording(false);
          balance.refresh();
          movements.refresh();
        }}
      />
    </div>
  );
}
