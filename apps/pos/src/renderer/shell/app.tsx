import type {
  Authorization,
  ChargeSaleByTransferOutcome,
  ChargeSaleInCashOutcome,
  CloseCashSessionOutcome,
  CloseLockedCashSessionOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { LocaleProvider } from "@purosur/ui";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { accessKey } from "../access/access-queries";
import type { CashMovementInput, CoreClient } from "../platform/core-client";
import { createQueryClient } from "../platform/query-client";
import { cancelReads, setQueryAnswer } from "../platform/set-query-answer";
import { useCoreStatus } from "../platform/use-core-status";
import type { CashSessionState } from "../register/cash-session-state";
import { cashSessionStateOf } from "../register/cash-session-state";
import {
  authorizersKey,
  cashKey,
  cashSessionQueryOptions,
  lockedClosersKey,
  registerKeys,
  useCashSessionQuery,
  useEnrollmentQuery,
  useRegisterServiceQuery,
} from "../register/register-queries";
import { salesKeys } from "../sales/sales-queries";
import type { Enrollment, RegisterServiceState } from "./router";
import { createAppRouter } from "./router";
import type { SignedInPerson } from "./signed-in-person";

export function App({ core }: { core: CoreClient }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <LocaleProvider>
      <QueryClientProvider client={queryClient}>
        <Register core={core} />
      </QueryClientProvider>
    </LocaleProvider>
  );
}

function Register({ core }: { core: CoreClient }) {
  const queryClient = useQueryClient();
  const coreStatus = useCoreStatus();
  const serviceRead = useRegisterServiceQuery({
    read: () => core.registerService(),
    enabled: coreStatus === "up",
  });
  let registerService: RegisterServiceState = "unknown";
  if (coreStatus === "up" && serviceRead.status === "loaded") {
    registerService = serviceRead.value;
  }
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
    enabled: enrollment === "enrolled" && registerService === "in_service",
  });
  const person = cashSession.status === "open" && cashSession.locked ? undefined : signedInPerson;

  function cancelCashSessionReads() {
    return cancelReads(queryClient, registerKeys.cashSession);
  }

  function setCashSession(state: CashSessionState) {
    queryClient.setQueryData(registerKeys.cashSession, state);
  }

  async function takeCashSession(session: OpenCashSession | null) {
    await cancelCashSessionReads();
    setCashSession(cashSessionStateOf(session));
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
      await setQueryAnswer(queryClient, registerKeys.enrollment, true);
    }
    return outcome;
  }

  async function takeSignedInPerson(outcome: SignInOutcome) {
    if (outcome.kind === "signed_in") {
      setPerson(outcome.person);
      await takeCashSession(outcome.cash_session);
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

  async function openCashSession(openingFloat: number) {
    const outcome = await core.openCashSession(openingFloat);
    if (outcome.kind === "not_signed_in") {
      setPerson(undefined);
    }
    if (outcome.kind === "opened") {
      await takeCashSession(outcome.cash_session);
    }
    if (outcome.kind === "already_open") {
      return readCashSession().then(
        (session): OpenCashSessionOutcome => {
          if (session.status === "open" && session.locked) {
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
    leaving: boolean,
  ) {
    const outcome = await core.closeCashSession(sessionId, countedCash);
    if (outcome.kind === "not_signed_in") {
      setPerson(undefined);
    }
    if (outcome.kind === "closed") {
      await cancelCashSessionReads();
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
      await cancelCashSessionReads();
      setCashSession({ status: "none" });
    }
    if (outcome.kind === "no_open_session" || outcome.kind === "not_locked") {
      await refreshCashSession();
    }
    return outcome satisfies CloseLockedCashSessionOutcome;
  }

  async function cancelLockedSale(closer: Authorization) {
    const outcome = await core.cancelLockedSale(closer);
    if (outcome.kind === "no_open_session" || outcome.kind === "not_locked") {
      await refreshCashSession();
    }
    return outcome;
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

  async function refreshAfterCharge(
    kind: (ChargeSaleInCashOutcome | ChargeSaleByTransferOutcome)["kind"],
  ) {
    if (kind === "completed") {
      if (cashSession.status === "open" && person !== undefined) {
        await setQueryAnswer(
          queryClient,
          salesKeys.currentSale(cashSession.id, person.user_id),
          null,
        );
      }
      void queryClient.invalidateQueries({ queryKey: cashKey });
    } else if (
      kind === "empty_sale" ||
      kind === "zero_total" ||
      kind === "no_open_sale" ||
      kind === "not_permitted"
    ) {
      void queryClient.invalidateQueries({ queryKey: salesKeys.currentSaleRoot });
    }
  }

  async function chargeSaleInCash(saleId: string, tendered: number) {
    const outcome = await core.chargeSaleInCash(saleId, tendered);
    await refreshAfterCharge(outcome.kind);
    return outcome;
  }

  async function chargeSaleByTransfer(saleId: string) {
    const outcome = await core.chargeSaleByTransfer(saleId);
    await refreshAfterCharge(outcome.kind);
    return outcome;
  }

  async function redeemPinCode(typedCode: string, newPin: string) {
    const outcome = await core.redeemPinCode(typedCode, newPin);
    if (outcome.kind === "resumed") {
      setPerson(outcome.person);
      await takeCashSession(outcome.cash_session);
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
    if (outcome.kind === "recorded") {
      void queryClient.invalidateQueries({ queryKey: cashKey });
    }
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
    lockedClosers: () => core.lockedClosers(),
    signIn,
    signOut,
    openCashSession,
    closeCashSession,
    closeLockedCashSession,
    cancelLockedSale,
    identifyLockedCloser,
    cashBalance,
    cashCountPreview: (countedCash: number) => core.cashCountPreview(countedCash),
    sessionOpenSale: () => core.sessionOpenSale(),
    cashMovements,
    cashMovementKinds: () => core.cashMovementKinds(),
    recordCashMovement,
    redeemPinCode,
    pinPolicy: () => core.pinPolicy(),
    checkEnrollmentCode: (typedCode: string) => core.checkEnrollmentCode(typedCode),
    checkPinCodeRedemption: (typedCode: string, newPin: string) =>
      core.checkPinCodeRedemption(typedCode, newPin),
    signInLookup: (email: string) => core.signInLookup(email),
    requestFirstPinCode: (userId: string) => core.requestFirstPinCode(userId),
    firstSignIn,
    currentSale: () => core.currentSale(),
    scanProduct: (code: string) => core.scanProduct(code),
    cashCharge: (saleId: string, tendered: number) => core.cashCharge(saleId, tendered),
    chargeSaleInCash,
    chargeSaleByTransfer,
    searchProducts: (query: string) => core.searchProducts(query),
    addProduct: (productId: string) => core.addProduct(productId),
    changeLineQuantity: (lineId: string, quantity: number, expectedQuantity: number) =>
      core.changeLineQuantity(lineId, quantity, expectedQuantity),
    removeSaleLine: (lineId: string) => core.removeSaleLine(lineId),
    cancelSale: () => core.cancelSale(),
    // A replaced core connection fails this request; the core coming back up asks again.
    refreshCashSession,
  };

  const [router] = useState(() => createAppRouter(queryClient, services));

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

  useEffect(
    () =>
      core.onPulled(() => {
        void queryClient.invalidateQueries({ queryKey: accessKey });
        void queryClient.invalidateQueries({ queryKey: authorizersKey });
        void queryClient.invalidateQueries({ queryKey: registerKeys.registerName });
        void queryClient.invalidateQueries({ queryKey: lockedClosersKey });
      }),
    [core, queryClient],
  );

  useEffect(() => {
    router.update({
      ...router.options,
      context: {
        ...router.options.context,
        coreStatus,
        registerService,
        enrollment,
        person,
        cashSession,
      },
    });
    void router.invalidate();
  }, [router, coreStatus, registerService, enrollment, person, cashSession]);

  return <RouterProvider router={router} context={{ queryClient, ...services }} />;
}
