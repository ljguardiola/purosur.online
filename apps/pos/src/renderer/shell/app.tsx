import { RouterProvider } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useCoreStatus } from "../platform/use-core-status";
import { createAppRouter, ROUTE_FOR_STATUS } from "./router";

export function App() {
  const coreStatus = useCoreStatus();
  const [router] = useState(() => createAppRouter());

  useEffect(() => {
    router.navigate({ to: ROUTE_FOR_STATUS[coreStatus], replace: true });
  }, [router, coreStatus]);

  return <RouterProvider router={router} context={{ coreStatus }} />;
}
