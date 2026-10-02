import type {
  Authorization,
  CancelLockedSaleOutcome,
  CashBalance,
  CloseLockedCashSessionOutcome,
  IdentifyLockedCloserOutcome,
  SessionOpenSale,
  SignInUser,
} from "@purosur/contracts";
import { useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import { LockedCashCount } from "./locked-cash-count";
import type { IdentifiedCloser, ReturnedCloser } from "./locked-closer-identification";
import { LockedCloserIdentification } from "./locked-closer-identification";

type Step =
  | { kind: "identifying"; returned: ReturnedCloser | undefined }
  | { kind: "counting"; closer: IdentifiedCloser };

export type LockedCloseScreenProps = {
  sessionId: string;
  opener: SignedInPerson;
  registerName: string | null;
  openedAt: string;
  loadCashBalance: () => Promise<CashBalance | null | "unavailable">;
  loadOpenSale: () => Promise<SessionOpenSale | null | "unavailable">;
  loadClosers: () => Promise<SignInUser[]>;
  identifyLockedCloser: (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;
  checkCountedCash: (countedCash: number) => Promise<"counted_cash"[]>;
  closeLockedCashSession: (
    countedCash: number,
    closer: Authorization,
  ) => Promise<CloseLockedCashSessionOutcome>;
  cancelLockedSale: (closer: Authorization) => Promise<CancelLockedSaleOutcome>;
};

export function LockedCloseScreen({
  sessionId,
  opener,
  registerName,
  openedAt,
  loadCashBalance,
  loadOpenSale,
  loadClosers,
  identifyLockedCloser,
  checkCountedCash,
  closeLockedCashSession,
  cancelLockedSale,
}: LockedCloseScreenProps) {
  const [step, setStep] = useState<Step>({ kind: "identifying", returned: undefined });

  if (step.kind === "counting") {
    const { closer } = step;
    return (
      <LockedCashCount
        sessionId={sessionId}
        opener={opener}
        closerName={closer.first_name}
        registerName={registerName}
        openedAt={openedAt}
        loadCashBalance={loadCashBalance}
        loadOpenSale={loadOpenSale}
        checkCountedCash={checkCountedCash}
        close={(countedCash) => closeLockedCashSession(countedCash, closer.authorization)}
        cancelSale={() => cancelLockedSale(closer.authorization)}
        onRefused={(refusal) =>
          setStep({
            kind: "identifying",
            returned: { refusal, firstName: closer.first_name },
          })
        }
      />
    );
  }

  return (
    <LockedCloserIdentification
      sessionId={sessionId}
      registerName={registerName}
      openedAt={openedAt}
      loadClosers={loadClosers}
      identify={identifyLockedCloser}
      returned={step.returned}
      onIdentified={(closer) => setStep({ kind: "counting", closer })}
    />
  );
}
