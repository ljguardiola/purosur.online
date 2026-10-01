import type {
  Authorization,
  CashBalance,
  CloseLockedCashSessionOutcome,
  IdentifyLockedCloserOutcome,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
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
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  identifyLockedCloser: (closer: Authorization) => Promise<IdentifyLockedCloserOutcome>;
  closeLockedCashSession: (
    countedCash: number,
    closer: Authorization,
  ) => Promise<CloseLockedCashSessionOutcome>;
};

export function LockedCloseScreen({
  sessionId,
  opener,
  registerName,
  openedAt,
  loadCashBalance,
  loadAuthorizers,
  identifyLockedCloser,
  closeLockedCashSession,
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
        close={(countedCash) => closeLockedCashSession(countedCash, closer.authorization)}
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
      opener={opener}
      registerName={registerName}
      openedAt={openedAt}
      loadClosers={() => loadAuthorizers("close_anothers_register_session")}
      identify={identifyLockedCloser}
      returned={step.returned}
      onIdentified={(closer) => setStep({ kind: "counting", closer })}
    />
  );
}
