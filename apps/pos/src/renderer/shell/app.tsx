import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { SignedInPerson } from "../access/signed-in-person";
import type { CoreClient } from "../platform/core-client";
import { useCoreStatus } from "../platform/use-core-status";
import type { Enrollment } from "./router";
import { createAppRouter, routeFor } from "./router";

export function App({ core }: { core: CoreClient }) {
  const coreStatus = useCoreStatus();
  const [knownEnrollment, setKnownEnrollment] = useState<Enrollment>("unknown");
  const enrollment = coreStatus === "up" ? knownEnrollment : "unknown";
  const [person, setPerson] = useState<SignedInPerson>();

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

  const services = {
    enroll,
    registerName: () => core.registerName(),
    signInUsers: () => core.signInUsers(),
    signIn,
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

  useEffect(() => core.onPulled(() => void router.invalidate()), [core, router]);

  useEffect(() => {
    router.navigate({ to: routeFor({ coreStatus, enrollment, person }), replace: true });
  }, [router, coreStatus, enrollment, person]);

  return (
    <RouterProvider router={router} context={{ coreStatus, enrollment, person, ...services }} />
  );
}
