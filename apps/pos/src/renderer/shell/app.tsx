import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useCoreStatus } from "../platform/use-core-status";
import { createAppRouter, ROUTE_FOR_STATUS } from "./router";

export function App() {
  const coreStatus = useCoreStatus();
  const router = useMemo(() => createAppRouter(), []);

  useEffect(() => {
    router.navigate({ to: ROUTE_FOR_STATUS[coreStatus], replace: true });
  }, [router, coreStatus]);

  return <RouterProvider router={router} context={{ coreStatus }} />;
}
