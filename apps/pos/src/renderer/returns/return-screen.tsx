import type {
  Authorization,
  CompleteReturnOutcome,
  FindSaleForReturnOutcome,
  PreviewReturnOutcome,
  ReturnDraftLineBody,
  SignInUser,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { useState } from "react";
import type { CompleteReturnInput, SaleForReturnReading } from "../platform/core-client";
import { OpenSessionRail } from "../shell/open-session-rail";
import type { SignedInPerson } from "../shell/signed-in-person";
import { useAuthorization } from "../shell/use-authorization";
import { ReturnBuildStep } from "./return-build-step";
import { ReturnFindStep } from "./return-find-step";
import type { SaleForReturn } from "./return-sale";
import { TicketConfirmationModal } from "./ticket-confirmation-modal";

export type ReturnScreenProps = {
  person: SignedInPerson;
  registerName: string | null;
  lock: () => void;
  findSaleForReturn: (
    reading: SaleForReturnReading,
    authorization: Authorization | undefined,
  ) => Promise<FindSaleForReturnOutcome>;
  previewReturn: (
    saleId: string,
    lines: readonly ReturnDraftLineBody[],
  ) => Promise<PreviewReturnOutcome>;
  completeReturn: (input: CompleteReturnInput) => Promise<CompleteReturnOutcome>;
  loadAuthorizers: (permission: AuthorizablePermissionKey) => Promise<SignInUser[]>;
  onSessionInvalid: () => void;
};

type Standing =
  | { step: "find" }
  | { step: "confirm"; sale: SaleForReturn; source: "QR" | "TYPED" }
  | { step: "build"; sale: SaleForReturn; source: "QR" | "TYPED" };

function ReturnFlow({
  person,
  registerName,
  lock,
  findSaleForReturn,
  previewReturn,
  completeReturn,
  loadAuthorizers,
  onSessionInvalid,
  restart,
}: ReturnScreenProps & { restart: () => void }) {
  const [standing, setStanding] = useState<Standing>({ step: "find" });
  const [authorizationRequired, setAuthorizationRequired] = useState(false);
  const authorization = useAuthorization({
    person,
    permission: "process_return",
    required: authorizationRequired,
    loadAuthorizers,
  });

  return (
    <div className="flex h-full w-full bg-surface-subtle">
      <OpenSessionRail
        registerName={registerName}
        lock={lock}
        current="return"
        abilities={person.abilities}
      />
      {standing.step === "build" ? (
        <ReturnBuildStep
          sale={standing.sale}
          source={standing.source}
          authorization={authorization}
          previewReturn={previewReturn}
          completeReturn={completeReturn}
          onAuthorizationRequired={() => setAuthorizationRequired(true)}
          onLeave={restart}
          onSessionInvalid={onSessionInvalid}
        />
      ) : (
        <ReturnFindStep
          authorization={authorization}
          findSaleForReturn={findSaleForReturn}
          onFound={(sale, source) => setStanding({ step: "confirm", sale, source })}
          onAuthorizationRequired={() => setAuthorizationRequired(true)}
          onSessionInvalid={onSessionInvalid}
        />
      )}
      {standing.step === "confirm" ? (
        <TicketConfirmationModal
          sale={standing.sale}
          registerName={registerName}
          onConfirm={() =>
            setStanding({ step: "build", sale: standing.sale, source: standing.source })
          }
          onReject={() => setStanding({ step: "find" })}
        />
      ) : null}
    </div>
  );
}

export function ReturnScreen(props: ReturnScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return <ReturnFlow key={attempt} {...props} restart={() => setAttempt(attempt + 1)} />;
}
