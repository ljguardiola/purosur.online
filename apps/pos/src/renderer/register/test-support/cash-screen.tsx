import type {
  CashBalance,
  ListedCashMovement,
  RecordableCashMovementKinds,
  RecordCashMovementOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey, CashMovementKind } from "@purosur/domain";
import type { ReactNode } from "react";
import { onTestFinished } from "vitest";
import { page } from "vitest/browser";
import type { SignedInPerson } from "../../shell/signed-in-person";
import { RegisterWindow } from "../../shell/test-support/register-window";
import { render } from "../../shell/test-support/render-with-router";
import { CashScreen } from "../cash-screen";

export const PERSON: SignedInPerson = {
  user_id: "u1",
  first_name: "Ada",
  abilities: ["open_cash_session"],
};
const OPENED_AT = "2026-09-30T09:02:00.000-03:00";
export const BALANCE: CashBalance = {
  opening_float: { amount: 2_000_000, direction: "in" },
  cash_sales: { amount: 3_500_000, direction: "in" },
  change_given: { amount: 930_000, direction: "out" },
  refunds: { amount: 0, direction: "out" },
  cash_in: { amount: 100_000, direction: "in" },
  expenses: { amount: 50_000, direction: "out" },
  withdrawals: { amount: 0, direction: "out" },
  expected: 4_620_000,
};

export const OPENING: ListedCashMovement = {
  id: "m1",
  type: "OPENING",
  amount: 2_000_000,
  reason: null,
  direction: "in",
  occurred_at: OPENED_AT,
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};
export const FLETE: ListedCashMovement = {
  id: "m2",
  type: "CASH_OUT",
  amount: 50_000,
  reason: "Flete",
  direction: "out",
  occurred_at: "2026-09-30T10:30:00.000-03:00",
  actor: { user_id: "u1", first_name: "Ada" },
  authorized_by: null,
};

const PERMISSION_OF_KIND: Record<CashMovementKind, AuthorizablePermissionKey> = {
  CASH_IN: "record_cash_in",
  CASH_OUT: "record_cash_expense",
  WITHDRAWAL: "withdraw_cash",
};

function kindsNeedingNoAuthorization(): RecordableCashMovementKinds {
  const needed = (kind: CashMovementKind) => ({
    permission: PERMISSION_OF_KIND[kind],
    authorization_required: false,
  });
  return {
    CASH_IN: needed("CASH_IN"),
    CASH_OUT: needed("CASH_OUT"),
    WITHDRAWAL: needed("WITHDRAWAL"),
  };
}

export async function renderScreen(
  props: {
    person?: SignedInPerson;
    loadCashBalance?: () => Promise<CashBalance | null | "unavailable">;
    loadCashMovements?: () => Promise<ListedCashMovement[] | null | "unavailable">;
    recordCashMovement?: () => Promise<RecordCashMovementOutcome>;
    clockGuard?: ReactNode;
  } = {},
) {
  await page.viewport(1366, 768);
  onTestFinished(() => page.viewport(414, 896));
  return render(
    <RegisterWindow>
      <CashScreen
        sessionId="s1"
        person={props.person ?? PERSON}
        lock={() => {}}
        loadCashBalance={props.loadCashBalance ?? (async () => BALANCE)}
        loadCashMovements={props.loadCashMovements ?? (async () => [OPENING, FLETE])}
        loadCashMovementKinds={async () => kindsNeedingNoAuthorization()}
        loadCashMovementPreview={async () => null}
        loadAuthorizers={async () => []}
        recordCashMovement={
          props.recordCashMovement ?? (async () => ({ kind: "recorded", authorized_by: null }))
        }
        clockGuard={props.clockGuard}
      />
    </RegisterWindow>,
  );
}
