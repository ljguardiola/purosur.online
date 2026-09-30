import type { OpenCashSession, OpenCashSessionOutcome } from "@purosur/contracts";
import type { AuthorizablePermissionKey } from "@purosur/domain";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CoreClient } from "../platform/core-client";
import { useCoreStatus } from "../platform/use-core-status";
import type { CashSessionState } from "./cash-session-state";
import type { Enrollment } from "./router";
import { createAppRouter, routeFor } from "./router";

const UNKNOWN_SESSION: CashSessionState = { status: "unknown" };

function stateOf(session: OpenCashSession | null | "unavailable"): CashSessionState {
  if (session === "unavailable") {
    return { status: "unavailable" };
  }
  return session === null
    ? { status: "none" }
    : { status: "open", openedAt: session.opened_at, openedBy: session.opened_by };
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

  async function signIn(userId: string, pin: string) {
    const outcome = await core.signIn(userId, pin);
    if (outcome.kind === "signed_in") {
      setPerson(outcome.person);
    }
    return outcome;
  }

  async function openCashSession(opener: SignedInPerson, openingFloat: number) {
    const outcome = await core.openCashSession(opener.user_id, openingFloat);
    if (outcome.kind === "opened") {
      setCashSession({ status: "open", openedAt: outcome.session.opened_at, openedBy: opener });
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

  function signOut() {
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
    redeemPinCode: (typedCode: string, newPin: string) => core.redeemPinCode(typedCode, newPin),
  };

  const [router] = useState(() => createAppRouter(services));

  useEffect(() => {
    if (coreStatus !== "up") {
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

  useEffect(() => core.onPulled(() => void router.invalidate()), [core, router]);

  useEffect(() => {
    router.navigate({
      to: routeFor({ coreStatus, enrollment, person, cashSession }),
      replace: true,
    });
  }, [router, coreStatus, enrollment, person, cashSession]);

  return (
    <RouterProvider
      router={router}
      context={{ coreStatus, enrollment, person, cashSession, ...services }}
    />
  );
}
