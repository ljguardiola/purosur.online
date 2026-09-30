import type {
  Authorization,
  CloseCashSessionOutcome,
  OpenCashSession,
  OpenCashSessionOutcome,
  SignInOutcome,
} from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CoreClient } from "../platform/core-client";
import { useCoreStatus } from "../platform/use-core-status";
import type { CashSessionState } from "./cash-session-state";
import type { Enrollment } from "./router";
import { createAppRouter, isSessionScreen, routeFor } from "./router";

const UNKNOWN_SESSION: CashSessionState = { status: "unknown" };
const CASH_SESSION_RETRY_MS = 5000;

function stateOf(session: OpenCashSession | null | "unavailable"): CashSessionState {
  if (session === "unavailable") {
    return { status: "unavailable" };
  }
  return session === null
    ? { status: "none" }
    : { status: "open", id: session.id, openedAt: session.opened_at, openedBy: session.opened_by };
}

export function App({ core }: { core: CoreClient }) {
  const coreStatus = useCoreStatus();
  const [knownEnrollment, setKnownEnrollment] = useState<Enrollment>("unknown");
  const enrollment = coreStatus === "up" ? knownEnrollment : "unknown";
  const [signedInPerson, setPerson] = useState<SignedInPerson>();
  const [cashSession, setCashSession] = useState<CashSessionState>(UNKNOWN_SESSION);
  // An open session always belongs to the person who opened it, whoever signed in before.
  const person = cashSession.status === "open" ? cashSession.openedBy : signedInPerson;

  async function enroll(typedCode: string) {
    const outcome = await core.enroll(typedCode);
    if (outcome.kind === "enrolled") {
      setKnownEnrollment("enrolled");
    }
    return outcome;
  }

  async function takeSignedInPerson(outcome: SignInOutcome) {
    if (outcome.kind === "signed_in") {
      setPerson(outcome.person);
    }
    if (outcome.kind === "cash_session_opened_by_another") {
      await core.cashSession().then(
        (session) => setCashSession(stateOf(session)),
        () => {},
      );
    }
    return outcome;
  }

  async function signIn(userId: string, pin: string) {
    return takeSignedInPerson(await core.signIn(userId, pin));
  }

  async function firstSignIn(userId: string, pin: string) {
    return takeSignedInPerson(await core.firstSignIn(userId, pin));
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
      return core.cashSession().then(
        (session): OpenCashSessionOutcome => {
          setCashSession(stateOf(session));
          return outcome;
        },
        (): OpenCashSessionOutcome => ({ kind: "unavailable" }),
      );
    }
    return outcome;
  }

  function refreshCashSession(session: OpenCashSession | null | "unavailable") {
    const next = stateOf(session);
    setCashSession((previous) =>
      previous.status === "open" && next.status === "open" && previous.id === next.id
        ? previous
        : next,
    );
  }

  async function closeCashSession(
    closer: SignedInPerson,
    sessionId: string,
    countedCash: number,
    authorization?: Authorization,
  ) {
    const outcome = await core.closeCashSession(sessionId, countedCash, authorization);
    if (outcome.kind === "not_signed_in") {
      setPerson(undefined);
    }
    if (outcome.kind === "closed") {
      setPerson(closer);
      setCashSession({ status: "none" });
    }
    if (outcome.kind === "no_open_session") {
      await core.cashSession().then(refreshCashSession, () => {});
    }
    return outcome satisfies CloseCashSessionOutcome;
  }

  async function cashBalance() {
    const balance = await core.cashBalance();
    if (balance === null) {
      await core.cashSession().then(refreshCashSession, () => {});
    }
    return balance;
  }

  function signOut() {
    core.signOut().catch(() => {});
    setPerson(undefined);
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
    cashBalance,
    redeemPinCode: (typedCode: string, newPin: string) => core.redeemPinCode(typedCode, newPin),
    signInLookup: (email: string) => core.signInLookup(email),
    firstSignIn,
    currentSale: () => core.currentSale(),
    scanProduct: (code: string) => core.scanProduct(code),
    searchProducts: (query: string) => core.searchProducts(query),
    addProduct: (productId: string) => core.addProduct(productId),
    // A replaced core connection fails this request; the core coming back up asks again.
    refreshCashSession: () => core.cashSession().then(refreshCashSession, () => {}),
  };

  const [router] = useState(() => createAppRouter(services));

  useEffect(() => {
    if (coreStatus !== "up") {
      setPerson(undefined);
      return;
    }
    let current = true;
    core.enrollmentStatus().then(
      (enrolled) => {
        if (current) {
          setKnownEnrollment(enrolled ? "enrolled" : "not_enrolled");
        }
      },
      // A replaced core connection fails this request; the core coming back up asks again.
      () => {},
    );
    return () => {
      current = false;
    };
  }, [core, coreStatus]);

  useEffect(() => {
    if (enrollment !== "enrolled") {
      return;
    }
    let current = true;
    core.cashSession().then(
      (session) => {
        if (current) {
          setCashSession(stateOf(session));
        }
      },
      // A replaced core connection fails this request; the core coming back up asks again.
      () => {},
    );
    return () => {
      current = false;
      setCashSession(UNKNOWN_SESSION);
    };
  }, [core, enrollment]);

  useEffect(() => {
    if (enrollment !== "enrolled" || cashSession.status !== "unavailable") {
      return;
    }
    let current = true;
    const retry = setTimeout(() => {
      core.cashSession().then(
        (session) => {
          if (current) {
            setCashSession(stateOf(session));
          }
        },
        // A replaced core connection fails this request; the core coming back up asks again.
        () => {},
      );
    }, CASH_SESSION_RETRY_MS);
    return () => {
      current = false;
      clearTimeout(retry);
    };
  }, [core, enrollment, cashSession]);

  useEffect(() => core.onPulled(() => void router.invalidate()), [core, router]);

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
