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
import type { CompletedReturn } from "./hand-over-refund-modal";
import { HandOverRefundModal } from "./hand-over-refund-modal";
import { ReturnBuildStep } from "./return-build-step";
import type { FoundSale } from "./return-find-step";
import { ReturnFindStep } from "./return-find-step";

export type ReturnScreenProps = {
  person: SignedInPerson;
  saleId?: string | undefined;
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
  | ({ step: "build" } & FoundSale)
  | ({ step: "completed"; completed: CompletedReturn } & FoundSale);

function ReturnFlow({
  person,
  saleId,
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
    permission: "process_return",
    required: authorizationRequired,
    loadAuthorizers,
  });

  const rail = <OpenSessionRail lock={lock} current="return" abilities={person.abilities} />;

  return (
    <>
      {standing.step === "build" || standing.step === "completed" ? (
        <ReturnBuildStep
          rail={rail}
          sale={standing.sale}
          source={standing.source}
          verificationRequired={standing.verificationRequired}
          authorization={authorization}
          finished={standing.step === "completed"}
          previewReturn={previewReturn}
          completeReturn={completeReturn}
          onAuthorizationRequired={() => setAuthorizationRequired(true)}
          onCompleted={(completed) => setStanding({ ...standing, step: "completed", completed })}
          onLeave={restart}
          onSessionInvalid={onSessionInvalid}
        />
      ) : (
        <ReturnFindStep
          rail={rail}
          authorization={authorization}
          saleId={saleId}
          findSaleForReturn={findSaleForReturn}
          onFound={(found) => setStanding({ step: "build", ...found })}
          onAuthorizationRequired={() => setAuthorizationRequired(true)}
          onSessionInvalid={onSessionInvalid}
        />
      )}
      {standing.step === "completed" ? (
        <HandOverRefundModal
          cashToHandOver={standing.completed.cashToHandOver}
          pendingRefunds={standing.completed.pendingRefunds}
          lines={standing.completed.lines}
          onDone={restart}
        />
      ) : null}
    </>
  );
}

export function ReturnScreen(props: ReturnScreenProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ReturnFlow
      key={attempt}
      {...props}
      saleId={attempt === 0 ? props.saleId : undefined}
      restart={() => setAttempt(attempt + 1)}
    />
  );
}
