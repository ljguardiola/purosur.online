import type {
  Authorization,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  OpenCashSessionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CashMovementInput, CoreClient } from "../platform/core-client";
import { createQueryClient } from "../platform/query-client";
import { useCoreStatus } from "../platform/use-core-status";
import {
  cashKey,
  cashSessionQueryOptions,
  registerKeys,
  useCashSessionQuery,
  useEnrollmentQuery,
} from "../register/register-queries";
import type { CashSessionState } from "./cash-session-state";
import type { Enrollment } from "./router";
import { createAppRouter, isSessionScreen, routeFor } from "./router";

export function App({ core }: { core: CoreClient }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <Register core={core} />
    </QueryClientProvider>
  );
}

function Register({ core }: { core: CoreClient }) {
  const queryClient = useQueryClient();
  const coreStatus = useCoreStatus();
  const enrollmentRead = useEnrollmentQuery({
    read: () => core.enrollmentStatus(),
    enabled: coreStatus === "up",
  });
  let enrollment: Enrollment = "unknown";
  if (coreStatus === "up" && enrollmentRead.status === "loaded") {
    enrollment = enrollmentRead.value ? "enrolled" : "not_enrolled";
  }
  const [signedInPerson, setPerson] = useState<SignedInPerson>();
  const cashSession = useCashSessionQuery({
    read: () => core.cashSession(),
    enabled: enrollment === "enrolled",
  });
  // Only the person who opened the open session can be in: anyone else leaves the register locked.
  const person =
    cashSession.status === "open" && signedInPerson?.user_id !== cashSession.openedBy.user_id
      ? undefined
      : signedInPerson;

  function setCashSession(state: CashSessionState) {
    queryClient.setQueryData(registerKeys.cashSession, state);
  }

  function refreshCashSession() {
    return queryClient.invalidateQueries({ queryKey: registerKeys.cashSession });
  }

  function readCashSession() {
    return queryClient.fetchQuery(cashSessionQueryOptions(() => core.cashSession()));
  }

  async function enroll(typedCode: string) {
    const outcome = await core.enroll(typedCode);
    if (outcome.kind === "enrolled") {
      queryClient.setQueryData(registerKeys.enrollment, true);
    }
    return outcome;
  }

  async function takeSignedInPerson(outcome: SignInOutcome) {
    if (outcome.kind === "signed_in") {
      setPerson(outcome.person);
    }
    if (outcome.kind === "cash_session_opened_by_another") {
      await refreshCashSession();
    }
    return outcome;
  }

  async function signIn(userId: string, pin: string) {
    return takeSignedInPerson(await core.signIn(userId, pin));
  }

  async function firstSignIn(userId: string, pin: string) {
    return takeSignedInPerson(await core.firstSignIn(userId, pin));
  }

  function signOut() {
    core.signOut().catch(() => {});
    setPerson(undefined);
  }

  async function openCashSession(opener: SignedInPerson, openingFloat: number) {
    const outcome = await core.openCashSession(openingFloat);
    if (outcome.kind === "not_signed_in") {
      setPerson(undefined);
    }
    if (outcome.kind === "opened") {
      setCashSession({
        status: "open",
        id: outcome.session.id,
        openedAt: outcome.session.opened_at,
        openedBy: opener,
      });
    }
    if (outcome.kind === "already_open") {
      return readCashSession().then(
        (session): OpenCashSessionOutcome => {
          if (session.status === "open" && session.openedBy.user_id !== opener.user_id) {
            signOut();
          }
          return outcome;
        },
        (): OpenCashSessionOutcome => ({ kind: "unavailable" }),
      );
    }
    return outcome;
  }

  async function closeCashSession(
    closer: SignedInPerson,
    sessionId: string,
    countedCash: number,
    authorization: Authorization | undefined,
    leaving: boolean,
  ) {
    const outcome = await core.closeCashSession(sessionId, countedCash, authorization);
    if (outcome.kind === "not_signed_in") {
      setPerson(undefined);
    }
    if (outcome.kind === "closed") {
      if (leaving) {
        signOut();
      } else {
        setPerson(closer);
      }
      setCashSession({ status: "none" });
    }
    if (outcome.kind === "no_open_session") {
      await refreshCashSession();
    }
    return outcome satisfies CloseCashSessionOutcome;
  }

  async function closeLockedCashSession(
    sessionId: string,
    countedCash: number,
    closer: Authorization,
  ) {
    const outcome = await core.closeLockedCashSession(sessionId, countedCash, closer);
    if (outcome.kind === "closed") {
      setCashSession({ status: "none" });
    }
    if (outcome.kind === "no_open_session" || outcome.kind === "not_locked") {
      await refreshCashSession();
    }
    return outcome satisfies CloseLockedCashSessionOutcome;
  }

  async function identifyLockedCloser(closer: Authorization) {
    const outcome = await core.identifyLockedCloser(closer);
    if (outcome.kind === "not_locked") {
      await refreshCashSession();
    }
    return outcome;
  }

  async function cashBalance() {
    const balance = await core.cashBalance();
    if (balance === null) {
      await refreshCashSession();
    }
    return balance;
  }

  async function redeemPinCode(typedCode: string, newPin: string) {
    const outcome = await core.redeemPinCode(typedCode, newPin);
    if (outcome.kind === "resumed") {
      setPerson(outcome.person);
    }
    return outcome;
  }

  async function cashMovements() {
    const movements = await core.cashMovements();
    if (movements === null) {
      await refreshCashSession();
    }
    return movements;
  }

  async function recordCashMovement(input: CashMovementInput) {
    const outcome = await core.recordCashMovement(input);
    if (outcome.kind === "no_open_session") {
      await refreshCashSession();
    }
    return outcome;
  }

  const services = {
    enroll,
    registerName: () => core.registerName(),
    signInUsers: () => core.signInUsers(),
    authorizers: (permission: AuthorizablePermissionKey) => core.authorizers(permission),
    signIn,
    signOut,
    openCashSession,
    closeCashSession,
    closeLockedCashSession,
    identifyLockedCloser,
    cashBalance,
    cashMovements,
    recordCashMovement,
    redeemPinCode,
    signInLookup: (email: string) => core.signInLookup(email),
    requestFirstPinCode: (userId: string) => core.requestFirstPinCode(userId),
    firstSignIn,
    currentSale: () => core.currentSale(),
    scanProduct: (code: string) => core.scanProduct(code),
    searchProducts: (query: string) => core.searchProducts(query),
    addProduct: (productId: string) => core.addProduct(productId),
    // A replaced core connection fails this request; the core coming back up asks again.
    refreshCashSession,
  };

  const [router] = useState(() => createAppRouter(services));

  useEffect(() => {
    if (coreStatus !== "up") {
      setPerson(undefined);
    }
  }, [coreStatus]);

  useEffect(() => {
    if (enrollment !== "enrolled") {
      void queryClient.resetQueries({ queryKey: registerKeys.cashSession });
    }
  }, [enrollment, queryClient]);

  const openSessionId = cashSession.status === "open" ? cashSession.id : undefined;
  const shownSessionId = useRef(openSessionId);
  useEffect(() => {
    if (shownSessionId.current !== openSessionId) {
      shownSessionId.current = openSessionId;
      void queryClient.resetQueries({ queryKey: cashKey });
    }
  }, [openSessionId, queryClient]);

  useEffect(() => core.onPulled(() => void queryClient.invalidateQueries()), [core, queryClient]);

  useEffect(() => {
    const to = routeFor({ coreStatus, enrollment, person, cashSession });
    if (to === "/session" && isSessionScreen(router.state.location.pathname)) {
      return;
    }
    router.navigate({ to, replace: true });
  }, [router, coreStatus, enrollment, person, cashSession]);

  return (
    <RouterProvider
      router={router}
      context={{ coreStatus, enrollment, person, cashSession, ...services }}
    />
  );
}
