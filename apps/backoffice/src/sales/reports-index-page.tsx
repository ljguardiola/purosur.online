import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { canSeeReturnsReport } from "../shell/backoffice-access";
import { useDocumentTitle } from "../shell/document-title";
import { ReportsIndexScreen } from "./reports-index-screen";

const route = getRouteApi("/signed-in/reports-area/reports");

export function ReportsIndexPage(): ReactElement {
  const { session } = route.useRouteContext();
  useDocumentTitle("Reportes · Puro Sur");
  return <ReportsIndexScreen returnsShown={canSeeReturnsReport(session)} />;
}
