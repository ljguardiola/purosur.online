import type { ReactElement } from "react";
import { useDocumentTitle } from "./document-title";
import { ReportsIndexScreen } from "./reports-index-screen";

export function ReportsIndexPage(): ReactElement {
  useDocumentTitle("Reportes · Puro Sur");
  return <ReportsIndexScreen />;
}
