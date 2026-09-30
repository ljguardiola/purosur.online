import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CoreClient } from "../platform/core-client";
import { useCoreStatus } from "../platform/use-core-status";
import type { Enrollment } from "./router";
import { createAppRouter, routeFor } from "./router";

export function App({ core }: { core: CoreClient }) {
  const coreStatus = useCoreStatus();
  const [knownEnrollment, setKnownEnrollment] = useState<Enrollment>("unknown");
  const enrollment = coreStatus === "up" ? knownEnrollment : "unknown";

  async function enroll(typedCode: string) {
    const outcome = await core.enroll(typedCode);
    if (outcome.kind === "enrolled") {
      setKnownEnrollment("enrolled");
    }
    return outcome;
  }

  function registerName() {
    return core.registerName();
  }

  const [router] = useState(() => createAppRouter(enroll, registerName));

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
    router.navigate({ to: routeFor({ coreStatus, enrollment }), replace: true });
  }, [router, coreStatus, enrollment]);

  return (
    <RouterProvider router={router} context={{ coreStatus, enrollment, enroll, registerName }} />
  );
}
