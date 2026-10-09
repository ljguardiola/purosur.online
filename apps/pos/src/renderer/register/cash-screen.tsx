import type {
  CashBalance,
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { Button, ScreenHeader } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { Lock, Plus } from "lucide-react";
import { useState } from "react";
import type { CashMovementInput } from "../platform/core-client";
import { OpenSessionRail } from "../shell/open-session-rail";
import { sessionEyebrow } from "../shell/session-eyebrow";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CashMovementsTable } from "./cash-movements-table";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { RecordCashMovementModal } from "./record-cash-movement-modal";
import { useCashBalanceQuery, useCashMovementsQuery } from "./register-queries";

export type CashScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  lock: () => void;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadCashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  loadCashMovementKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
};

export function CashScreen({
  sessionId,
  person,
  registerName,
  openedAt,
  lock,
  loadCashBalance,
  loadCashMovements,
  loadCashMovementKinds,
  loadAuthorizers,
  recordCashMovement,
}: CashScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const movements = useCashMovementsQuery(sessionId, loadCashMovements);
  const [recording, setRecording] = useState(false);

  return (
    <div className="flex h-full w-full bg-surface">
      <OpenSessionRail
        firstName={person.first_name}
        registerName={registerName}
        lock={lock}
        current="cash"
      />
      <main className="flex flex-1 flex-col gap-6 p-8">
        <ScreenHeader
          eyebrow={sessionEyebrow(registerName, openedAt)}
          title="Movimientos de efectivo"
        />
        <CashMovementsTable state={movements} />
      </main>
      <ExpectedCashPanel eyebrow="EFECTIVO ESPERADO AHORA" balance={balance}>
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
          onPress={() => void navigate({ to: "/cash-count", search: { leaving: false } })}
        >
          Cerrar caja
        </Button>
      </ExpectedCashPanel>
      <RecordCashMovementModal
        open={recording}
        person={person}
        registerName={registerName}
        openedAt={openedAt}
        {...(balance.status === "loaded" ? { expectedCash: balance.value.expected } : {})}
        loadKinds={loadCashMovementKinds}
        loadAuthorizers={loadAuthorizers}
        recordCashMovement={recordCashMovement}
        onClose={() => setRecording(false)}
        onRecorded={() => {
          setRecording(false);
        }}
      />
    </div>
  );
}
