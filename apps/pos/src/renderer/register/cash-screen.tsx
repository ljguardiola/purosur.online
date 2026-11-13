import type {
  CashBalance,
  CashMovementPreview,
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import type { KeyLegendItem } from "@purosur/ui";
import { Button, KeyLegend, KeyTile } from "@purosur/ui";
import { useNavigate } from "@tanstack/react-router";
import { DoorClosed } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import type { CashMovementInput } from "../platform/core-client";
import { useKeys } from "../platform/key-layer";
import { OpenSessionRail } from "../shell/open-session-rail";
import { RegisterFrame } from "../shell/register-frame";
import type { SignedInPerson } from "../shell/signed-in-person";
import { CASH_MOVEMENT_ICONS } from "./cash-movement-icons";
import { CashMovementsTable } from "./cash-movements-table";
import { ExpectedCashPanel } from "./expected-cash-panel";
import { RecordCashMovementPanel } from "./record-cash-movement-panel";
import type { CashMovementToPreview } from "./register-queries";
import { useCashBalanceQuery, useCashMovementsQuery } from "./register-queries";

const MOVEMENT_KEYS = [
  { key: "1", kind: "CASH_IN", label: "Ingreso" },
  { key: "2", kind: "CASH_OUT", label: "Gasto" },
  { key: "3", kind: "WITHDRAWAL", label: "Retiro" },
] as const satisfies readonly { key: "1" | "2" | "3"; kind: CashMovementKind; label: string }[];

const LEGEND: readonly KeyLegendItem[] = [
  ...MOVEMENT_KEYS.map(({ key, label }) => ({ keyName: key, label })),
  { keyName: "F12", label: "Cerrar caja" },
];

const FIELD_LEGEND: readonly KeyLegendItem[] = [{ keyName: "Tab", label: "Campo" }];

export type CashScreenProps = {
  sessionId: string;
  person: SignedInPerson;
  lock: () => void;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadCashMovements: () => Promise<ListedCashMovement[] | null | "unavailable">;
  loadCashMovementKinds: () => Promise<RecordableCashMovementKinds | null | "unavailable">;
  loadCashMovementPreview: (
    movement: CashMovementToPreview,
  ) => Promise<CashMovementPreview | null | "unavailable">;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  recordCashMovement: (input: CashMovementInput) => Promise<RecordCashMovementOutcome>;
  clockGuard?: ReactNode | undefined;
};

export function CashScreen({
  sessionId,
  person,
  lock,
  loadCashBalance,
  loadCashMovements,
  loadCashMovementKinds,
  loadCashMovementPreview,
  loadAuthorizers,
  recordCashMovement,
  clockGuard,
}: CashScreenProps) {
  const navigate = useNavigate();
  const balance = useCashBalanceQuery(sessionId, loadCashBalance);
  const movements = useCashMovementsQuery(sessionId, loadCashMovements);
  const [recording, setRecording] = useState<CashMovementKind>();

  function closeCash() {
    void navigate({ to: "/cash-count" });
  }

  useKeys([
    ...MOVEMENT_KEYS.map(({ key, kind }) => ({
      key,
      run: () => setRecording(kind),
      enabled: recording === undefined,
    })),
    { key: "F12", run: closeCash, enabled: recording === undefined },
  ]);

  return (
    <RegisterFrame
      background="surface"
      rail={<OpenSessionRail lock={lock} current="cash" abilities={person.abilities} />}
      aside={
        recording === undefined ? (
          <ExpectedCashPanel eyebrow="EFECTIVO ESPERADO" balance={balance}>
            <Button
              variant="primary"
              size="large"
              fullWidth
              icon={<DoorClosed />}
              keycap="F12"
              onPress={closeCash}
            >
              Cerrar caja
            </Button>
            <div className="grid grid-cols-3 gap-3">
              {MOVEMENT_KEYS.map(({ key, kind, label }) => (
                <KeyTile
                  key={kind}
                  label={label}
                  icon={CASH_MOVEMENT_ICONS[kind]}
                  keyName={key}
                  onPress={() => setRecording(kind)}
                />
              ))}
            </div>
          </ExpectedCashPanel>
        ) : (
          <RecordCashMovementPanel
            kind={recording}
            sessionId={sessionId}
            person={person}
            {...(balance.status === "loaded" ? { expectedCash: balance.value.expected } : {})}
            loadKinds={loadCashMovementKinds}
            loadAuthorizers={loadAuthorizers}
            recordCashMovement={recordCashMovement}
            readPreview={loadCashMovementPreview}
            onClose={() => setRecording(undefined)}
            onRecorded={() => setRecording(undefined)}
          />
        )
      }
    >
      <main className="flex min-w-0 flex-1 flex-col gap-4 pt-6 pr-6 pb-6 pl-8">
        <h1 className="sr-only">Movimientos de efectivo</h1>
        {clockGuard}
        <CashMovementsTable
          state={movements}
          legend={LEGEND}
          locked={recording !== undefined}
        />
        {recording === undefined ? null : <KeyLegend items={FIELD_LEGEND} />}
      </main>
    </RegisterFrame>
  );
}
