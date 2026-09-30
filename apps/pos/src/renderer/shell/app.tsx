import { RouterProvider } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { CoreClient } from "../platform/core-client";
import { useCoreStatus } from "../platform/use-core-status";
import type { Enrollment } from "./router";
import { createAppRouter, routeFor } from "./router";

export function App({ core }: { core: CoreClient }) {
  const coreStatus = useCoreStatus();
  const [knownEnrollment, setKnownEnrollment] = useState<Enrollment>("unknown");
  const enrollment = coreStatus === "up" ? knownEnrollment : "unknown";
  const [registerName, setRegisterName] = useState<string | null>(null);

  const enroll = useCallback(
    async (typedCode: string) => {
      const outcome = await core.enroll(typedCode);
      if (outcome.kind === "enrolled") {
        setKnownEnrollment("enrolled");
      }
      return outcome;
    },
    [core],
  );

  const [router] = useState(() => createAppRouter(enroll));

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
    if (coreStatus !== "up" || enrollment !== "enrolled") {
      return;
    }
    let current = true;
    core.registerName().then(
      (name) => {
        if (current) {
          setRegisterName(name);
        }
      },
      () => {},
    );
    return () => {
      current = false;
    };
  }, [core, coreStatus, enrollment]);

  useEffect(() => {
    router.navigate({ to: routeFor({ coreStatus, enrollment }), replace: true });
  }, [router, coreStatus, enrollment]);

  useEffect(() => {
    router.update({ context: { coreStatus, enrollment, registerName, enroll } });
    router.invalidate();
  }, [router, coreStatus, enrollment, registerName, enroll]);

  return (
    <RouterProvider router={router} context={{ coreStatus, enrollment, registerName, enroll }} />
  );
}
